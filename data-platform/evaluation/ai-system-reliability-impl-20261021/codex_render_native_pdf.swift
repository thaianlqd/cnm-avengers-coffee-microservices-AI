import AppKit
import PDFKit
let source=CommandLine.arguments[1]
let target=CommandLine.arguments[2]
try FileManager.default.createDirectory(atPath:target, withIntermediateDirectories:true)
let doc=PDFDocument(url:URL(fileURLWithPath:source))!
print("pages",doc.pageCount)
for i in 0..<doc.pageCount {
 let page=doc.page(at:i)!
 let bounds=page.bounds(for:.mediaBox)
 let img=page.thumbnail(of:NSSize(width:bounds.width*1.5,height:bounds.height*1.5),for:.mediaBox)
 let rep=NSBitmapImageRep(data:img.tiffRepresentation!)!
 try rep.representation(using:.png,properties:[:])!.write(to:URL(fileURLWithPath:target+String(format:"/page-%02d.png",i+1)))
 try (page.string ?? "").write(toFile:target+String(format:"/page-%02d.txt",i+1),atomically:true,encoding:.utf8)
}
