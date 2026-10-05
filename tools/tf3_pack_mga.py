#!/usr/bin/env python3
"""
tf3_pack_mga.py - pack metal / gloss / AO greyscale maps into one RGB texture
for Transport Fever 3's map_metal_gloss_ao (suffix _mga).

Channel order used: R = metal, G = gloss, B = AO (Transport Fever 2 convention;
confirm against the TF3 .mtl reference page before relying on it).

Requires Pillow:  pip install pillow

Examples
  python tf3_pack_mga.py --metal m.png --gloss g.png --ao ao.png --out body_mga.tga
  python tf3_pack_mga.py --from-tsc-spec body_spec.png --ao ao.png --metal-const 0.05 --out body_mga.tga
  python tf3_pack_mga.py --gloss g.png --out body_mga.tga          # missing maps become constants
"""
import argparse
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: pip install pillow")


def load_gray(path, size=None):
    im = Image.open(path).convert("L")
    if size and im.size != size:
        im = im.resize(size, Image.LANCZOS)
    return im


def const_gray(value, size):
    return Image.new("L", size, int(round(max(0.0, min(1.0, value)) * 255)))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--metal", help="metalness map (white = metal)")
    ap.add_argument("--gloss", help="glossiness map (white = glossy)")
    ap.add_argument("--ao", help="ambient occlusion map (white = unoccluded)")
    ap.add_argument("--from-tsc-spec", help="use a TSC specular map as the gloss channel")
    ap.add_argument("--metal-const", type=float, default=0.0, help="metal value when no map (0..1)")
    ap.add_argument("--gloss-const", type=float, default=0.3, help="gloss value when no map (0..1)")
    ap.add_argument("--ao-const", type=float, default=1.0, help="AO value when no map (0..1)")
    ap.add_argument("--out", required=True, help="output file (.tga recommended; Model Editor converts to .dds)")
    a = ap.parse_args(argv)

    gloss_src = a.gloss or a.from_tsc_spec
    first = next((p for p in (a.metal, gloss_src, a.ao) if p), None)
    if first is None:
        sys.exit("give at least one map")
    size = Image.open(first).size

    r = load_gray(a.metal, size) if a.metal else const_gray(a.metal_const, size)
    g = load_gray(gloss_src, size) if gloss_src else const_gray(a.gloss_const, size)
    b = load_gray(a.ao, size) if a.ao else const_gray(a.ao_const, size)
    Image.merge("RGB", (r, g, b)).save(a.out)
    print("wrote %s (%dx%d)  R=metal G=gloss B=ao" % (a.out, size[0], size[1]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
