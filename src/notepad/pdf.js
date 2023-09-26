// pdfGenerator.js
import jsPDF from 'jspdf';

export const generatePDF = (noteContent) => {
  // Split the note content into paragraphs based on line breaks
  const paragraphs = noteContent.split('\n');

  // Create a new PDF document with custom page size (e.g., letter size: 8.5x11 inches)
  const pdf = new jsPDF({
    orientation: 'portrait', // 'landscape' for landscape orientation
    unit: 'in', // units: 'mm', 'cm', 'm', 'pt', 'in'
    format: [8.5, 11], // Page size (width, height) in inches
    marginLeft: 0.5, // Left margin in inches
    marginRight: 0.5, // Right margin in inches
    marginTop: 0.5, // Top margin in inches
    marginBottom: 0.5, // Bottom margin in inches
  });

  const maxLineWidth = 7.5; // Adjust based on your page width
  const lineHeight = 0.2; // Adjust line spacing as needed
  let currentY = 0.5; // Initial Y position

  paragraphs.forEach((paragraph) => {
    const lines = pdf.splitTextToSize(paragraph, maxLineWidth);
    const remainingLines = pdf.splitTextToSize(paragraph, maxLineWidth - 0.2); // Check if the content fits with a smaller line width

    if (currentY + lines.length * lineHeight > 10.5) {
      // If the content exceeds the page height, add a new page
      pdf.addPage();
      currentY = 0.5; // Reset Y position for the new page
    }

    // Add lines to the PDF
    lines.forEach((line) => {
      pdf.text(line, 0.5, currentY);
      currentY += lineHeight;
    });

    if (currentY + remainingLines.length * lineHeight > 10.5) {
      // If the remaining content exceeds the page height, add a new page
      pdf.addPage();
      currentY = 0.5; // Reset Y position for the new page
    }
  });

  // Return the PDF as a data URI
  return pdf.output('datauristring');
};

