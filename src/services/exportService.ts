import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { AuditLog, CustomerOrder, Meeting, MeetingAttendance } from '../types';

export function exportRowsToExcel(filename: string, sheetName: string, rows: Record<string, any>[]) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportSummaryToPDF(
  filename: string,
  title: string,
  subtitle: string,
  headers: string[],
  rows: string[][]
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFontSize(18);
  doc.setTextColor(14, 116, 144);
  doc.text('7Sunday Meet — Seven Sunday Ethiopia', 40, 42);

  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 40, 68);

  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`${subtitle} | Generated ${new Date().toLocaleString()}`, 40, 86);

  let y = 114;
  const pageWidth = doc.internal.pageSize.getWidth();
  const colWidth = Math.floor((pageWidth - 80) / Math.max(1, headers.length));

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(40, y - 14, pageWidth - 80, 22, 'F');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  headers.forEach((h, idx) => {
    doc.text(String(h).slice(0, 28), 46 + idx * colWidth, y);
  });
  y += 22;

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);

  rows.forEach((row) => {
    if (y > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 50;
    }
    row.forEach((cell, idx) => {
      doc.text(String(cell || '-').slice(0, 34), 46 + idx * colWidth, y);
    });
    doc.setDrawColor(226, 232, 240);
    doc.line(40, y + 6, pageWidth - 40, y + 6);
    y += 20;
  });

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function exportMeetingsExcel(meetings: Meeting[]) {
  const rows = meetings.map((m) => ({
    Code: m.code,
    Title: m.title,
    Scope: m.meetingScope,
    Type: m.type,
    Priority: m.priority,
    Status: m.status,
    Host: m.hostName,
    Department: m.department || 'General',
    Start: m.scheduledStart,
    End: m.scheduledEnd,
    ParticipantsCount: (m.participantUids || []).length,
  }));
  exportRowsToExcel(`7sunday-meet-meetings-${Date.now()}.xlsx`, 'Meetings', rows);
}

export function exportMeetingsPDF(meetings: Meeting[]) {
  exportSummaryToPDF(
    `7sunday-meet-meetings-${Date.now()}.pdf`,
    'Meetings Schedule & Operational Report',
    `Total Meetings: ${meetings.length}`,
    ['Code', 'Title', 'Scope', 'Priority', 'Status', 'Host', 'Scheduled Start'],
    meetings.map((m) => [
      m.code,
      m.title,
      m.meetingScope,
      m.priority,
      m.status,
      m.hostName,
      new Date(m.scheduledStart).toLocaleString(),
    ])
  );
}

export function exportOrdersExcel(orders: CustomerOrder[]) {
  const rows = orders.map((o) => ({
    OrderNumber: o.orderNumber,
    InvoiceNumber: o.invoiceNumber || '-',
    Customer: o.customerName,
    Email: o.customerEmail,
    ItemsCount: o.items.length,
    TotalAmount: o.totalAmount,
    Currency: o.currency,
    Status: o.status,
    DMSStatus: o.dmsSyncStatus || 'not_configured',
  }));
  exportRowsToExcel(`7sunday-meet-orders-${Date.now()}.xlsx`, 'Customer Orders', rows);
}

export function exportOrderInvoicePDF(order: CustomerOrder) {
  exportSummaryToPDF(
    `invoice-${order.invoiceNumber || order.orderNumber}.pdf`,
    `Official Customer Invoice: ${order.invoiceNumber || order.orderNumber}`,
    `Customer: ${order.customerName} (${order.customerEmail}) | Status: ${order.status.toUpperCase()}`,
    ['Product / Service', 'Quantity', 'Unit Price', 'Subtotal'],
    [
      ...order.items.map((item) => [
        item.productName,
        String(item.quantity),
        `${item.unitPrice.toLocaleString()} ${order.currency}`,
        `${item.subtotal.toLocaleString()} ${order.currency}`,
      ]),
      ['TOTAL', '', '', `${order.totalAmount.toLocaleString()} ${order.currency}`],
    ]
  );
}

export function exportAttendancePDF(records: MeetingAttendance[]) {
  exportSummaryToPDF(
    `7sunday-meet-attendance-${Date.now()}.pdf`,
    'Meeting Attendance Log',
    `Total Records: ${records.length}`,
    ['Meeting Code', 'Participant', 'Role', 'Joined At', 'Duration (sec)'],
    records.map((r) => [
      r.meetingCode,
      r.participantName,
      r.participantRole || 'participant',
      new Date(r.joinedAt).toLocaleString(),
      String(r.durationSeconds),
    ])
  );
}

export function exportAuditLogsPDF(logs: AuditLog[]) {
  exportSummaryToPDF(
    `7sunday-meet-audit-${Date.now()}.pdf`,
    'Security & Administration Audit Trail',
    `Entries: ${logs.length}`,
    ['Actor Email', 'Role', 'Action', 'Target', 'Details'],
    logs.map((l) => [l.actorEmail, l.actorRole, l.action, `${l.targetType}:${l.targetId || '-'}`, l.details])
  );
}
