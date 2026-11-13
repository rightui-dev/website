// Run from the repository root: swift tools/render-social.swift
// The exported PNG is committed; the website build needs no Swift toolchain.
import AppKit
import CoreText

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let assets = root.appendingPathComponent("apps/site/assets")
CTFontManagerRegisterFontsForURL(assets.appendingPathComponent("fonts/Geist.ttf") as CFURL, .process, nil)
let width = 1200, height = 630
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width, pixelsHigh: height, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
let context = NSGraphicsContext.current!.cgContext
context.setAllowsAntialiasing(true)
func color(_ value: UInt32) -> NSColor {
  NSColor(srgbRed: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
}
func box(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ fill: UInt32, radius: CGFloat = 0, stroke: UInt32? = nil) {
  let path = NSBezierPath(roundedRect: NSRect(x: x, y: 630-y-h, width: w, height: h), xRadius: radius, yRadius: radius)
  color(fill).setFill(); path.fill()
  if let border = stroke { color(border).setStroke(); path.lineWidth = 1; path.stroke() }
}
func text(_ value: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ tint: UInt32 = 0xfafafa, weight: NSFont.Weight = .regular) {
  let base = NSFont(name: "Geist", size: size) ?? NSFont.systemFont(ofSize: size)
  let font = NSFont(descriptor: base.fontDescriptor.addingAttributes([.traits: [NSFontDescriptor.TraitKey.weight: weight.rawValue]]), size: size) ?? base
  let string = NSAttributedString(string: value, attributes: [.font: font, .foregroundColor: color(tint), .kern: size > 45 ? -1.8 : -0.3])
  string.draw(at: NSPoint(x: x, y: 630-y-string.size().height))
}
box(0, 0, 1200, 630, 0x09090b)
// An offset field of interface tiles gives the card its own visual identity.
for x in stride(from: 700, through: 1160, by: 40) {
  for y in stride(from: 96, through: 500, by: 40) { box(CGFloat(x), CGFloat(y), 2, 2, 0x27272a, radius: 1) }
}
let logo = NSImage(contentsOf: assets.appendingPathComponent("brand/rightui.png"))!
logo.draw(in: NSRect(x: 59, y: 630-42-64, width: 64, height: 64))
text("rightui", 133, 52, 34, weight: .semibold)
text("UI COMPONENTS FOR EXACT", 72, 169, 15, 0xa1a1aa, weight: .medium)
text("Your next interface.", 68, 210, 60, weight: .semibold)
text("Built with Exact.", 68, 278, 60, weight: .semibold)
text("Components, blocks and charts.", 72, 375, 25, 0xa1a1aa)
text("Ready to make your own.", 72, 410, 25, 0xa1a1aa)
box(72, 538, 1056, 1, 0x27272a)
text("Web  /  iOS  /  macOS", 72, 563, 18, 0xa1a1aa)
text("rightui.dev", 1014, 563, 18, 0xfafafa, weight: .medium)
box(756, 141, 346, 176, 0x141416, radius: 18, stroke: 0x333336)
text("Make it yours", 782, 166, 21, weight: .medium)
text("A familiar starting point.", 782, 198, 16, 0xa1a1aa)
box(782, 248, 154, 42, 0xfafafa, radius: 9)
text("Get started", 806, 257, 17, 0x18181b, weight: .medium)
box(948, 248, 128, 42, 0x202023, radius: 9, stroke: 0x3f3f46)
text("Customize", 965, 257, 17, 0xe4e4e7)
box(718, 335, 220, 145, 0x141416, radius: 18, stroke: 0x333336)
text("Appearance", 742, 359, 18, weight: .medium)
text("Dark mode", 742, 419, 16, 0xa1a1aa)
box(863, 416, 48, 27, 0xfafafa, radius: 13.5)
box(887, 420, 19, 19, 0x18181b, radius: 9.5)
box(956, 335, 184, 145, 0x141416, radius: 18, stroke: 0x333336)
text("Your next idea", 978, 359, 17, 0xa1a1aa)
for (i, h) in [22, 34, 29, 48, 58, 72].enumerated() {
  box(CGFloat(978 + i*23), CGFloat(455-h), 14, CGFloat(h), i == 5 ? 0xfafafa : 0x52525b, radius: 4)
}
NSGraphicsContext.restoreGraphicsState()
let output = assets.appendingPathComponent("brand/rightui-og.png")
try bitmap.representation(using: .png, properties: [:])!.write(to: output)
print("Wrote \(output.path) (1200 × 630)")
