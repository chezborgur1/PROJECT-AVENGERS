// Validates an .xlsx, .pptx or .docx with the Open XML SDK (schema and semantic
// rules, Microsoft 365 file format) and prints one line per error:
//   [ErrorType] /part/uri | xpath | id | description
// then "TOTAL_ERRORS n". Exit code 0 when clean, 1 with errors, 2 when the
// package cannot be opened at all.
//
//   dotnet run --project tools/openxml-validate -- "<file>" [maxErrors]

using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

if (args.Length < 1)
{
    Console.Error.WriteLine("usage: openxml-validate <file.xlsx|file.pptx|file.docx> [maxErrors]");
    return 2;
}
var path = args[0];
var max = args.Length > 1 ? int.Parse(args[1]) : 10000;
try
{
    using OpenXmlPackage package = Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".xlsx" or ".xlsm" => SpreadsheetDocument.Open(path, false),
        ".pptx" => PresentationDocument.Open(path, false),
        ".docx" => WordprocessingDocument.Open(path, false),
        var ext => throw new NotSupportedException($"unknown extension {ext}"),
    };
    var validator = new OpenXmlValidator(FileFormatVersions.Microsoft365) { MaxNumberOfErrors = max };
    var errors = validator.Validate(package).ToList();
    foreach (var e in errors)
        Console.WriteLine($"[{e.ErrorType}] {e.Part?.Uri} | {e.Path?.XPath} | {e.Id} | {e.Description}");
    Console.WriteLine($"TOTAL_ERRORS {errors.Count}");
    return errors.Count == 0 ? 0 : 1;
}
catch (Exception ex)
{
    Console.WriteLine($"OPEN_FAILED {ex.GetType().Name}: {ex.Message}");
    return 2;
}
