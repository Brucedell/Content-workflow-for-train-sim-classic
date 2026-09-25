--------------------------------------------------------------------------------
-- TrolleyPole.lua - dual trolley pole engine script (Texas Electric Railway)
--
-- Implements the "Revised Trolley Pole Gameplay Mechanics Spec":
--   pole travel in animation frames 0..100, five states, gravity fall of
--   50 frames/s, route wire-height presets, rolling re-wire, stow/lock,
--   leading-pole detachment and a curvature/speed risk loop.
--
-- Conservative Lua: no '#' or '%' operators, so it also runs on the older
-- embedded Lua used by Train Sim Classic.
--
-- ---------------------------------------------------------------------------
-- BLUEPRINT REQUIREMENTS (engine blueprint, Blueprint Editor 2)
--   Custom control values (min..max, default):
--     PoleFrontKey, PoleRearKey          0..1, 0  held = 1 (keys [ and ])
--     PoleFrontStow, PoleRearStow        0..1, 0  press = 1 (Shift+P / P)
--     PoleHeightMode                     0..1, 0  press = 1 (Alt+P)
--     PoleHeightAdjust                  -1..1, 0  -1 / +1 while held (, and .)
--     PoleFrontFrame, PoleRearFrame      0..100   outputs for cab indicators
--     PoleSpark, PoleThud                0..1     one-frame pulses for sounds
--   Exterior AnimSet IDs: "poleFront", "poleRear"  (frames 0..100 exported
--     at 100 fps, so animation time in seconds = frame / 100)
--   Geometry nodes for the stowed mesh swap: "pole_front_stowed",
--     "pole_rear_stowed", "pole_front", "pole_rear"
--   Key bindings are made in the vehicle's input mapper blueprint.
-- ---------------------------------------------------------------------------

------------------------------------------------------------------ tuning ----
ANIM_FPS          = 100      -- fps the pole .ia was exported at
MAX_FRAME         = 100
FALL_RATE         = 50       -- frames per second (spec)
HOIST_RATE        = 40       -- frames per second while the rope is hauled
WIND_DRAG         = 0.6      -- frames/s lost per mph while hoisting
DOUBLE_TAP_TIME   = 0.35     -- seconds between presses for a manual de-wire
LEADING_LIMIT_MPH = 7.5      -- spec: leading pole comes off above 5-10 mph
REMIND_MPH        = 2.0      -- spec: once-per-session loose-pole reminder
PRESETS = { 65, 72, 78, 92 } -- Cascadian, NEC, UIC, Milwaukee Road
PRESET_NAMES = { "Pacific Cascadian interurban", "Northeast Corridor",
                 "European UIC", "Milwaukee Road heavy freight" }
NUM_PRESETS = 4
RISK_THRESHOLD    = 7.5      -- spec
RISK_PER_SECOND   = 0.12     -- probability scale; spec's random(1,500) per frame is frame-rate dependent
BAD_WIRE_SPIKE    = 3.0      -- risk multiplier set by a "BadWire" track marker
USE_PANTOGRAPH_INTERLOCK = true  -- drive PantographControl from the pole state

MPS_TO_MPH = 2.23694

-------------------------------------------------------------- state -------
LOCKED, LOOSE, HOIST, SEATED, FALLING = 0, 1, 2, 3, 4
STATE_NAME = { [0] = "Stowed", "Grounded", "Hoisting", "Attached", "Falling" }

gTime = 0
gInit = false
gHeightMode = 0            -- 0 preset, 1 custom, 2 locked
gPreset = 1
gCustomFrame = 72
gRiskModifier = 1.0
gReminderShown = false
gLastModeKey = 0

gPoles = {
  { name = "front", key = "PoleFrontKey", stow = "PoleFrontStow", anim = "poleFront",
    out = "PoleFrontFrame", node = "pole_front", stowedNode = "pole_front_stowed" },
  { name = "rear",  key = "PoleRearKey",  stow = "PoleRearStow",  anim = "poleRear",
    out = "PoleRearFrame",  node = "pole_rear",  stowedNode = "pole_rear_stowed" },
}

------------------------------------------------------------- helpers ------
local function get(name)
  return Call("*:GetControlValue", name, 0) or 0
end

local function set(name, v)
  Call("*:SetControlValue", name, 0, v)
end

local function alert(msg, seconds)
  SysCall("ScenarioManager:ShowAlertMessageExt", "Trolley pole", msg, seconds or 3, 0)
end

local function clamp(v, lo, hi)
  if v < lo then return lo end
  if v > hi then return hi end
  return v
end

local function targetFrame()
  if gHeightMode == 0 then return PRESETS[gPreset] end
  return gCustomFrame
end

-- Position an exterior animation at an absolute frame using only the
-- documented Reset + AddTime calls (works whether the pole goes up or down).
local function showFrame(pole)
  Call("*:Reset", pole.anim)
  if pole.frame > 0 then
    Call("*:AddTime", pole.anim, pole.frame / ANIM_FPS)
  end
  set(pole.out, pole.frame)
end

local function setStowedMesh(pole, stowed)
  local s = 0
  if stowed then s = 1 end
  Call("*:ActivateNode", pole.stowedNode, s)
  Call("*:ActivateNode", pole.node, 1 - s)
end

local function pulse(name)
  set(name, 1)
  gPulses[name] = true
end

gPulses = {}

local function enter(pole, state)
  pole.state = state
  if state == FALLING then
    pulse("PoleSpark")
  elseif state == SEATED then
    alert("Attached (" .. pole.name .. " pole)", 2)
  elseif state == LOCKED then
    setStowedMesh(pole, true)
  elseif state == LOOSE and pole.stowedShown then
    setStowedMesh(pole, false)
  end
  pole.stowedShown = (state == LOCKED)
end

------------------------------------------------------------ lifecycle -----
function Initialise()
  for i = 1, 2 do
    local p = gPoles[i]
    p.frame = 0
    p.state = LOCKED
    p.lastPress = -10
    p.wasDown = false
    p.wasStow = false
    p.stowedShown = true
  end
  Call("*:BeginUpdate")
end

function OnControlValueChange(name, index, value)
  -- Pass every control through, as the Kuju samples do. Without this the
  -- player's input would never reach the control.
  if Call("*:ControlExists", name, index) == 1 then
    Call("*:SetControlValue", name, index, value)
  end
end

function OnCustomSignalMessage(message)
  -- A track marker sends "BadWire" where the overhead is poor (spec item 4.2).
  if message == "BadWire" then
    gRiskModifier = BAD_WIRE_SPIKE
    alert("CAUTION: Bad wire location detected!", 3)
  end
end

------------------------------------------------------------ height mode ---
local function updateHeightMode(dt)
  local m = get("PoleHeightMode")
  if m > 0.5 and gLastModeKey <= 0.5 then
    if gHeightMode == 0 then
      -- first press in preset mode cycles the preset; hold Shift etc. via mapper
      gPreset = gPreset + 1
      if gPreset > NUM_PRESETS then
        gPreset = 1
        gCustomFrame = PRESETS[NUM_PRESETS]
        gHeightMode = 1
        alert("Wire height: CUSTOM (use , and .)", 3)
      else
        alert("Wire height preset: " .. PRESET_NAMES[gPreset] .. " (frame " .. PRESETS[gPreset] .. ")", 3)
      end
    elseif gHeightMode == 1 then
      gHeightMode = 2
      alert("Wire height LOCKED at frame " .. math.floor(gCustomFrame + 0.5), 3)
    else
      gHeightMode = 0
      gPreset = 1
      alert("Wire height preset: " .. PRESET_NAMES[gPreset], 3)
    end
  end
  gLastModeKey = m
  if gHeightMode == 1 then
    gCustomFrame = clamp(gCustomFrame + get("PoleHeightAdjust") * 10 * dt, 20, MAX_FRAME)
  end
end

------------------------------------------------------------ risk model ----
local function detachRisk(pole, leading, held, mph)
  local curvature = math.abs(Call("*:GetCurvature") or 0)   -- 1 / radius (m)
  local risk = curvature * 1000 * mph * 0.1                   -- curvature per km x speed
  risk = risk * gRiskModifier
  if leading and not held then
    risk = risk + mph * 1.5
  elseif held then
    risk = risk * 0.10                                        -- conductor steadies the rope
  end
  return risk
end

------------------------------------------------------------ per pole ------
local function updatePole(pole, dt, mph, movingForward)
  local held = get(pole.key) > 0.5
  local pressed = held and not pole.wasDown
  pole.wasDown = held

  -- double tap = manual de-wire
  if pressed then
    if gTime - pole.lastPress < DOUBLE_TAP_TIME and (pole.state == SEATED or pole.state == HOIST) then
      enter(pole, FALLING)
    end
    pole.lastPress = gTime
  end

  -- stow / unstow toggle (only on the roof)
  local stow = get(pole.stow) > 0.5
  if stow and not pole.wasStow then
    if pole.state == LOOSE then enter(pole, LOCKED)
    elseif pole.state == LOCKED then enter(pole, LOOSE) end
  end
  pole.wasStow = stow

  local target = targetFrame()
  local leading = (pole.name == "front" and movingForward) or (pole.name == "rear" and not movingForward)
  local before = pole.frame

  if pole.state == LOCKED then
    pole.frame = 0
  elseif pole.state == LOOSE then
    pole.frame = 0
    if held and pole.lastPress == gTime then enter(pole, HOIST) end
  elseif pole.state == HOIST then
    if held then
      local rate = HOIST_RATE - WIND_DRAG * mph
      if rate < 5 then rate = 5 end
      pole.frame = pole.frame + rate * dt
      if pole.frame >= target then
        pole.frame = target
        enter(pole, SEATED)
      end
    else
      enter(pole, FALLING)          -- released early: slips back to the saddle
    end
  elseif pole.state == SEATED then
    pole.frame = target             -- follows the wire height
    if leading and not held and mph > LEADING_LIMIT_MPH then
      enter(pole, FALLING)
      alert("Leading pole dewired!", 3)
    else
      local risk = detachRisk(pole, leading, held, mph)
      if risk > RISK_THRESHOLD and math.random() < (risk / 500) * RISK_PER_SECOND * 60 * dt then
        enter(pole, FALLING)
        alert("Pole detached!", 3)
      end
    end
  elseif pole.state == FALLING then
    pole.frame = pole.frame - FALL_RATE * dt
    if pole.frame <= 0 then
      pole.frame = 0
      pulse("PoleThud")
      enter(pole, LOOSE)
    end
  end

  if pole.frame ~= before or not pole.shown then
    showFrame(pole)
    pole.shown = true
  end
end

------------------------------------------------------------ main loop -----
function Update(dt)
  gTime = gTime + dt

  -- clear last frame's sound pulses
  for name, _ in pairs(gPulses) do
    set(name, 0)
    gPulses[name] = nil
  end

  if not gInit then
    gInit = true
    for i = 1, 2 do
      setStowedMesh(gPoles[i], true)
      showFrame(gPoles[i])
    end
  end

  if Call("*:GetIsPlayer") ~= 1 then
    return                          -- AI copies: leave poles as they are
  end

  local mph = math.abs(Call("*:GetSpeed") or 0) * MPS_TO_MPH
  local movingForward = get("Reverser") >= 0

  updateHeightMode(dt)

  -- risk modifier decays back to 1.0; faster below 40 mph (spec)
  if gRiskModifier > 1.0 then
    local decay = 0.2 * dt
    if mph < 40 then decay = decay + (gRiskModifier - 1.0) * 0.15 end
    gRiskModifier = gRiskModifier - decay
    if gRiskModifier < 1.0 then gRiskModifier = 1.0 end
  end

  local seated, loose = false, false
  for i = 1, 2 do
    local p = gPoles[i]
    updatePole(p, dt, mph, movingForward)
    if p.state == SEATED then seated = true end
    if p.state == LOOSE or p.state == HOIST then loose = true end
  end

  -- power interlock: traction only while a pole is on the wire
  if USE_PANTOGRAPH_INTERLOCK then
    if seated then set("PantographControl", 1) else set("PantographControl", 0) end
  end

  -- once-per-session reminder
  if loose and not seated and mph > REMIND_MPH and not gReminderShown then
    gReminderShown = true
    alert("Pole is loose on the roof: stow it (P / Shift+P) or raise it ([ / ]).", 5)
  end
end
