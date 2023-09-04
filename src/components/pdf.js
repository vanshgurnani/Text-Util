// // pdfGenerator.js
// import jsPDF from 'jspdf';

// export const generatePDF = (noteContent) => {
//   const pdf = new jsPDF();
//   pdf.text(noteContent, 10, 10); // Add the note content to the PDF

//   // Return the PDF as a data URI
//   return pdf.output('datauristring');
// };

// pdfGenerator.js
// import jsPDF from 'jspdf';

// export const generatePDF = (noteContent) => {
//   // Split the note content into paragraphs based on line breaks
//   const paragraphs = noteContent.split('\n');

//   // Create a new PDF document
//   const pdf = new jsPDF();

//   // Iterate through the paragraphs and add them as separate lines in the PDF
//   paragraphs.forEach((paragraph, index) => {
//     // Add the paragraph to the PDF
//     pdf.text(paragraph, 10, 10 + index * 10); // You can adjust the coordinates and font size as needed
//   });

//   // Return the PDF as a data URI
//   return pdf.output('datauristring');
// };




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
    const lines = pdf.splitTextToSize(paragraphs, maxLineWidth);
    lines.forEach((line, index) => {
    pdf.text(line, 0.5, 0.5 + index * 0.2);
    });



  // Return the PDF as a data URI
  return pdf.output('datauristring');
};

