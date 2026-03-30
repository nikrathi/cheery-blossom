import AppKit
import Foundation

func resolveURL(root: URL, environmentKey: String, defaultPath: String, isDirectory: Bool = false) -> URL {
    if let override = ProcessInfo.processInfo.environment[environmentKey], !override.isEmpty {
        return URL(fileURLWithPath: override, isDirectory: isDirectory)
    }
    return root.appendingPathComponent(defaultPath, isDirectory: isDirectory)
}

struct Item: Codable {
    let name: String
    let number: Int
}

struct Ticket: Codable {
    let ticket_id: Int
    let foodLovers: [Item]
    let colorMood: [Item]
    let sakuraVibes: [Item]
    let japanVibes: [Item]

    private enum CodingKeys: String, CodingKey {
        case ticket_id
        case foodLovers = "Food Lovers"
        case colorMood = "Color Mood"
        case sakuraVibes = "Sakura Vibes"
        case japanVibes = "Japan Vibes"
    }
}

struct Manifest: Codable {
    let ticket_count: Int
    let tickets: [Ticket]
}

struct PanelLayout {
    let numberX: CGFloat
    let labelX: CGFloat
    let rowYs: [CGFloat]
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let baseImageURL = resolveURL(root: root, environmentKey: "TAMBOLA_BASE_IMAGE", defaultPath: "assets/base_template.png")
let manifestURL = resolveURL(root: root, environmentKey: "TAMBOLA_MANIFEST_JSON", defaultPath: "output/tickets_manifest.json")
let outputDirectory = resolveURL(root: root, environmentKey: "TAMBOLA_TICKETS_OUTPUT_DIR", defaultPath: "output/tickets", isDirectory: true)
let previewDirectory = resolveURL(root: root, environmentKey: "TAMBOLA_PREVIEWS_OUTPUT_DIR", defaultPath: "output/previews", isDirectory: true)

let decoder = JSONDecoder()
let manifestData = try Data(contentsOf: manifestURL)
let manifest = try decoder.decode(Manifest.self, from: manifestData)

guard let baseImage = NSImage(contentsOf: baseImageURL) else {
    fatalError("Unable to load base image at \(baseImageURL.path)")
}

let canvasSize = NSSize(width: 1200, height: 800)
let foodPanel = PanelLayout(numberX: 176, labelX: 230, rowYs: [132, 184, 236, 288])
let colorPanel = PanelLayout(numberX: 672, labelX: 730, rowYs: [132, 184, 236, 288])
let sakuraPanel = PanelLayout(numberX: 176, labelX: 230, rowYs: [445, 497, 549, 601])
let japanPanel = PanelLayout(numberX: 672, labelX: 730, rowYs: [463, 515, 567, 619])

let numberFont = NSFont(name: "Baskerville-SemiBold", size: 26) ?? NSFont.boldSystemFont(ofSize: 26)
let labelFont = NSFont(name: "Baskerville", size: 24) ?? NSFont.systemFont(ofSize: 24)
let ticketFont = NSFont(name: "Baskerville-SemiBold", size: 16) ?? NSFont.boldSystemFont(ofSize: 16)
let bannerFont = NSFont(name: "Baskerville-SemiBoldItalic", size: 24)
    ?? NSFont(name: "Times New Roman Bold Italic", size: 24)
    ?? NSFont.boldSystemFont(ofSize: 24)

let numberColor = NSColor(calibratedRed: 0.67, green: 0.25, blue: 0.34, alpha: 1.0)
let labelColor = NSColor(calibratedRed: 0.31, green: 0.22, blue: 0.24, alpha: 1.0)
let ticketColor = NSColor(calibratedRed: 0.70, green: 0.39, blue: 0.49, alpha: 1.0)
let bannerFill = NSColor(calibratedRed: 0.85, green: 0.38, blue: 0.55, alpha: 1.0)
let bannerShadow = NSColor(calibratedRed: 0.74, green: 0.26, blue: 0.42, alpha: 0.22)

let paragraphStyle = NSMutableParagraphStyle()
paragraphStyle.lineBreakMode = .byTruncatingTail

let numberAttributes: [NSAttributedString.Key: Any] = [
    .font: numberFont,
    .foregroundColor: numberColor,
    .paragraphStyle: paragraphStyle,
]

let labelAttributes: [NSAttributedString.Key: Any] = [
    .font: labelFont,
    .foregroundColor: labelColor,
    .paragraphStyle: paragraphStyle,
]

let ticketAttributes: [NSAttributedString.Key: Any] = [
    .font: ticketFont,
    .foregroundColor: ticketColor,
]

func yFromTop(_ top: CGFloat, height: CGFloat) -> CGFloat {
    canvasSize.height - top - height
}

func rectFromTop(x: CGFloat, top: CGFloat, width: CGFloat, height: CGFloat) -> NSRect {
    NSRect(x: x, y: yFromTop(top, height: height), width: width, height: height)
}

func drawEntry(item: Item, at rowY: CGFloat, layout: PanelLayout) {
    let numberText = "\(item.number)."
    let numberSize = numberText.size(withAttributes: numberAttributes)
    let labelSize = item.name.size(withAttributes: labelAttributes)
    numberText.draw(
        at: NSPoint(x: layout.numberX, y: yFromTop(rowY, height: numberSize.height)),
        withAttributes: numberAttributes
    )
    item.name.draw(
        at: NSPoint(x: layout.labelX, y: yFromTop(rowY, height: labelSize.height)),
        withAttributes: labelAttributes
    )
}

func drawPanel(items: [Item], layout: PanelLayout) {
    for (item, rowY) in zip(items, layout.rowYs) {
        drawEntry(item: item, at: rowY, layout: layout)
    }
}

func drawTicketBadge(_ ticketID: Int) {
    let title = String(format: "TICKET %02d", ticketID)
    let size = title.size(withAttributes: ticketAttributes)
    let origin = NSPoint(
        x: (canvasSize.width - size.width) / 2.0,
        y: yFromTop(18, height: size.height)
    )
    title.draw(at: origin, withAttributes: ticketAttributes)
}

func drawJapanVibesBanner() {
    let rect = rectFromTop(x: 662, top: 394, width: 232, height: 46)
    let shadowRect = rect.offsetBy(dx: 0, dy: -2)
    let shadowPath = NSBezierPath(roundedRect: shadowRect, xRadius: 16, yRadius: 16)
    bannerShadow.setFill()
    shadowPath.fill()

    bannerFill.setFill()
    let centerPath = NSBezierPath(roundedRect: rect, xRadius: 16, yRadius: 16)
    centerPath.fill()

    let leftTail = NSBezierPath()
    leftTail.move(to: NSPoint(x: rect.minX, y: rect.midY))
    leftTail.line(to: NSPoint(x: rect.minX - 16, y: rect.minY + 8))
    leftTail.line(to: NSPoint(x: rect.minX, y: rect.minY + 14))
    leftTail.close()
    leftTail.fill()

    let rightTail = NSBezierPath()
    rightTail.move(to: NSPoint(x: rect.maxX, y: rect.midY))
    rightTail.line(to: NSPoint(x: rect.maxX + 16, y: rect.minY + 8))
    rightTail.line(to: NSPoint(x: rect.maxX, y: rect.minY + 14))
    rightTail.close()
    rightTail.fill()

    let title = "Japan Vibes"
    let titleAttributes: [NSAttributedString.Key: Any] = [
        .font: bannerFont,
        .foregroundColor: NSColor.white,
    ]
    let titleSize = title.size(withAttributes: titleAttributes)
    let point = NSPoint(
        x: rect.midX - titleSize.width / 2.0,
        y: rect.midY - titleSize.height / 2.0 - 1
    )
    title.draw(at: point, withAttributes: titleAttributes)
}

func makeBitmap(size: NSSize) -> NSBitmapImageRep {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: Int(size.width),
        pixelsHigh: Int(size.height),
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else {
        fatalError("Unable to create bitmap context")
    }
    return bitmap
}

func pngData(from bitmap: NSBitmapImageRep) -> Data {
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Unable to generate PNG data")
    }
    return png
}

func renderTicket(_ ticket: Ticket) throws -> NSBitmapImageRep {
    let bitmap = makeBitmap(size: canvasSize)
    guard let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Unable to create graphics context")
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphicsContext

    baseImage.draw(in: NSRect(origin: .zero, size: canvasSize))
    drawTicketBadge(ticket.ticket_id)
    drawPanel(items: ticket.foodLovers, layout: foodPanel)
    drawPanel(items: ticket.colorMood, layout: colorPanel)
    drawPanel(items: ticket.sakuraVibes, layout: sakuraPanel)
    drawPanel(items: ticket.japanVibes, layout: japanPanel)
    drawJapanVibesBanner()

    graphicsContext.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    return bitmap
}

func makeContactSheet(from imageURLs: [URL]) throws {
    let thumbWidth: CGFloat = 240
    let thumbHeight: CGFloat = 160
    let columns: CGFloat = 3
    let spacing: CGFloat = 28
    let padding: CGFloat = 32
    let rows = ceil(CGFloat(imageURLs.count) / columns)
    let sheetSize = NSSize(
        width: padding * 2 + columns * thumbWidth + (columns - 1) * spacing,
        height: padding * 2 + rows * (thumbHeight + 24) + (rows - 1) * spacing
    )

    let bitmap = makeBitmap(size: sheetSize)
    guard let graphicsContext = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fatalError("Unable to create contact sheet context")
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphicsContext

    NSColor(calibratedRed: 0.99, green: 0.96, blue: 0.97, alpha: 1.0).setFill()
    NSBezierPath(rect: NSRect(origin: .zero, size: sheetSize)).fill()

    for (index, imageURL) in imageURLs.enumerated() {
        guard let ticketImage = NSImage(contentsOf: imageURL) else { continue }
        let row = CGFloat(index / Int(columns))
        let column = CGFloat(index % Int(columns))
        let x = padding + column * (thumbWidth + spacing)
        let top = padding + row * (thumbHeight + 24 + spacing)
        let y = sheetSize.height - top - thumbHeight
        ticketImage.draw(in: NSRect(x: x, y: y, width: thumbWidth, height: thumbHeight))

        let label = String(format: "Ticket %02d", index + 1)
        label.draw(
            at: NSPoint(x: x, y: y + thumbHeight + 4),
            withAttributes: ticketAttributes
        )
    }

    graphicsContext.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    let outputURL = previewDirectory.appendingPathComponent("tickets_contact_sheet.png")
    try pngData(from: bitmap).write(to: outputURL)
}

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
try FileManager.default.createDirectory(at: previewDirectory, withIntermediateDirectories: true)

var generatedURLs: [URL] = []
for ticket in manifest.tickets {
    let rendered = try renderTicket(ticket)
    let outputURL = outputDirectory.appendingPathComponent(String(format: "ticket_%02d.png", ticket.ticket_id))
    try pngData(from: rendered).write(to: outputURL)
    generatedURLs.append(outputURL)
}

try makeContactSheet(from: generatedURLs)

let previewURL = previewDirectory.appendingPathComponent("tickets_contact_sheet.png")
print("Rendered \(generatedURLs.count) tickets to \(outputDirectory.path)")
print("Created preview at \(previewURL.path)")
