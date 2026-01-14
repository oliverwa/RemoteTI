import jsPDF from 'jspdf';

interface InspectionTask {
  title: string;
  detail: string;
  status: 'pass' | 'fail' | 'na' | null;
  completedAt?: string;
  completedBy?: string;
  comment?: string;
}

interface InspectionData {
  inspection: {
    tasks: InspectionTask[];
    type?: string;
    sessionInfo?: any;
  };
  inspectorName: string;
  droneId: string;
  hangarName: string;
  sessionName: string;
  completedAt: string;
  images?: Array<{ name: string; data: string }>;
}

export const generateInspectionPDF = async (data: InspectionData): Promise<Blob> => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let currentY = margin;

  // Helper function to check if we need a new page
  const checkNewPage = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - margin) {
      pdf.addPage();
      currentY = margin;
      return true;
    }
    return false;
  };

  // ========== HEADER ==========
  pdf.setFillColor(25, 118, 210); // Material Blue
  pdf.rect(0, 0, pageWidth, 30, 'F');
  
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(20);
  pdf.setFont('helvetica', 'bold');
  pdf.text('DRONE INSPECTION REPORT', pageWidth / 2, 15, { align: 'center' });
  
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'normal');
  pdf.text(new Date(data.completedAt || new Date()).toLocaleDateString(), pageWidth / 2, 22, { align: 'center' });

  currentY = 40;

  // ========== INSPECTION OVERVIEW ==========
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Inspection Overview', margin, currentY);
  currentY += 8;

  pdf.setDrawColor(200, 200, 200);
  pdf.setFillColor(248, 249, 250);
  pdf.rect(margin, currentY, contentWidth, 40, 'FD');
  
  currentY += 8;
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  
  const leftCol = margin + 5;
  const rightCol = margin + contentWidth / 2;
  
  // Left column
  pdf.setFont('helvetica', 'bold');
  pdf.text('Hangar:', leftCol, currentY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.hangarName || 'N/A', leftCol + 30, currentY);
  
  // Right column
  pdf.setFont('helvetica', 'bold');
  pdf.text('Drone:', rightCol, currentY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.droneId || 'N/A', rightCol + 30, currentY);
  
  currentY += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Session:', leftCol, currentY);
  pdf.setFont('helvetica', 'normal');
  const sessionText = data.sessionName || 'N/A';
  const maxSessionWidth = 60;
  const truncatedSession = sessionText.length > 25 ? sessionText.substring(0, 25) + '...' : sessionText;
  pdf.text(truncatedSession, leftCol + 30, currentY);
  
  pdf.setFont('helvetica', 'bold');
  pdf.text('Inspector:', rightCol, currentY);
  pdf.setFont('helvetica', 'normal');
  pdf.text(data.inspectorName || 'N/A', rightCol + 30, currentY);
  
  currentY += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Completed:', leftCol, currentY);
  pdf.setFont('helvetica', 'normal');
  const completedDate = data.completedAt ? new Date(data.completedAt).toLocaleString() : 'In Progress';
  pdf.text(completedDate, leftCol + 30, currentY);

  currentY += 20;

  // ========== INSPECTION ITEMS ==========
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Inspection Items', margin, currentY);
  currentY += 10;

  const tasks = data.inspection.tasks || [];
  
  tasks.forEach((task, index) => {
    checkNewPage(25);
    
    // Task header with status color
    let statusColor = { r: 200, g: 200, b: 200 }; // Default gray
    let statusText = 'Pending';
    
    if (task.status === 'pass') {
      statusColor = { r: 34, g: 197, b: 94 }; // Green
      statusText = 'PASS';
    } else if (task.status === 'fail') {
      statusColor = { r: 239, g: 68, b: 68 }; // Red
      statusText = 'FAIL';
    } else if (task.status === 'na') {
      statusColor = { r: 156, g: 163, b: 175 }; // Gray
      statusText = 'N/A';
    }
    
    // Status indicator box
    pdf.setFillColor(statusColor.r, statusColor.g, statusColor.b);
    pdf.rect(margin, currentY, 3, 8, 'F');
    
    // Task number and title
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text(`${index + 1}. ${task.title}`, margin + 6, currentY + 5);
    
    // Status badge
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(statusColor.r, statusColor.g, statusColor.b);
    pdf.text(`[${statusText}]`, pageWidth - margin - 20, currentY + 5);
    
    currentY += 10;
    
    // Task details
    if (task.detail) {
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(100, 100, 100);
      const detailLines = pdf.splitTextToSize(task.detail, contentWidth - 10);
      detailLines.forEach((line: string) => {
        checkNewPage(5);
        pdf.text(line, margin + 6, currentY);
        currentY += 4;
      });
    }
    
    // Completion info
    if (task.completedAt || task.completedBy) {
      currentY += 2;
      pdf.setFontSize(8);
      pdf.setTextColor(120, 120, 120);
      
      if (task.completedBy) {
        pdf.text(`Completed by: ${task.completedBy}`, margin + 6, currentY);
        currentY += 4;
      }
      
      if (task.completedAt) {
        const completedTime = new Date(task.completedAt).toLocaleString();
        pdf.text(`Time: ${completedTime}`, margin + 6, currentY);
        currentY += 4;
      }
    }
    
    // Comments
    if (task.comment && task.comment.trim()) {
      currentY += 2;
      pdf.setFillColor(255, 253, 230);
      const commentHeight = pdf.splitTextToSize(task.comment, contentWidth - 15).length * 4 + 4;
      
      checkNewPage(commentHeight + 5);
      
      pdf.rect(margin + 6, currentY, contentWidth - 12, commentHeight, 'F');
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(100, 100, 100);
      
      const commentLines = pdf.splitTextToSize(task.comment, contentWidth - 15);
      currentY += 3;
      commentLines.forEach((line: string) => {
        pdf.text(line, margin + 8, currentY);
        currentY += 4;
      });
      currentY += 2;
    }
    
    currentY += 8; // Space between tasks
  });

  // ========== SUMMARY ==========
  checkNewPage(40);
  
  currentY += 10;
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, currentY, contentWidth, 35, 'F');
  
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  currentY += 8;
  pdf.text('Inspection Summary', margin + 5, currentY);
  
  currentY += 8;
  const completedTasks = tasks.filter(t => t.status !== null);
  const passedTasks = tasks.filter(t => t.status === 'pass');
  const failedTasks = tasks.filter(t => t.status === 'fail');
  const naTasks = tasks.filter(t => t.status === 'na');
  
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Total Tasks: ${tasks.length}`, margin + 5, currentY);
  pdf.text(`Completed: ${completedTasks.length}/${tasks.length}`, rightCol, currentY);
  
  currentY += 6;
  pdf.setTextColor(34, 197, 94);
  pdf.text(`Passed: ${passedTasks.length}`, margin + 5, currentY);
  
  pdf.setTextColor(239, 68, 68);
  pdf.text(`Failed: ${failedTasks.length}`, margin + 50, currentY);
  
  pdf.setTextColor(156, 163, 175);
  pdf.text(`N/A: ${naTasks.length}`, rightCol, currentY);
  
  currentY += 8;
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`Inspector: ${data.inspectorName || 'Not specified'}`, margin + 5, currentY);

  // ========== CAMERA IMAGES (if any) ==========
  if (data.images && data.images.length > 0) {
    pdf.addPage();
    currentY = margin;
    
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Camera Images', margin, currentY);
    currentY += 10;
    
    // Display 2 images per page
    const imageWidth = (contentWidth - 10) / 2;
    const imageHeight = imageWidth * 0.75; // 4:3 aspect ratio
    
    let imageIndex = 0;
    while (imageIndex < data.images.length) {
      // Check if we need a new page for images
      if (currentY + imageHeight > pageHeight - margin) {
        pdf.addPage();
        currentY = margin;
      }
      
      // First image in row
      const img1 = data.images[imageIndex];
      if (img1) {
        try {
          pdf.addImage(img1.data, 'JPEG', margin, currentY, imageWidth, imageHeight);
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          pdf.text(img1.name, margin + imageWidth / 2, currentY + imageHeight + 5, { align: 'center' });
        } catch (error) {
          console.error('Failed to add image:', error);
          pdf.setFillColor(240, 240, 240);
          pdf.rect(margin, currentY, imageWidth, imageHeight, 'F');
          pdf.text('Image Error', margin + imageWidth / 2, currentY + imageHeight / 2, { align: 'center' });
        }
      }
      
      // Second image in row (if exists)
      imageIndex++;
      if (imageIndex < data.images.length) {
        const img2 = data.images[imageIndex];
        try {
          pdf.addImage(img2.data, 'JPEG', margin + imageWidth + 10, currentY, imageWidth, imageHeight);
          pdf.setFontSize(9);
          pdf.text(img2.name, margin + imageWidth + 10 + imageWidth / 2, currentY + imageHeight + 5, { align: 'center' });
        } catch (error) {
          console.error('Failed to add image:', error);
          pdf.setFillColor(240, 240, 240);
          pdf.rect(margin + imageWidth + 10, currentY, imageWidth, imageHeight, 'F');
          pdf.text('Image Error', margin + imageWidth + 10 + imageWidth / 2, currentY + imageHeight / 2, { align: 'center' });
        }
      }
      
      imageIndex++;
      currentY += imageHeight + 15;
    }
  }

  // ========== FOOTER ==========
  const totalPages = pdf.internal.pages.length - 1;
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    pdf.text('Generated by Remote TI System', margin, pageHeight - 10);
    pdf.text(new Date().toLocaleDateString(), pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  return pdf.output('blob');
};