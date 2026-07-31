'use strict';

/** Export to CSV */
const ExportCSV = (() => {
  function export_(records) {
    const headers = [
      'Hari', 'Saldo Sebelum', 'Daily Income', 'Weekly Bonus', 'Generate',
      'Investasi', 'Lost Decimal', 'Investasi Cair', 'Aktif', 'Saldo Sesudah',
      'Total Aset', 'Keputusan', 'Alasan'
    ];

    const rows = records.map(r => [
      r.day,
      r.balanceBefore,
      r.dailyIncome,
      r.weeklyBonus,
      r.generate,
      r.investedAmount,
      r.lostDecimal,
      r.maturedTotal,
      r.activeCount,
      r.balanceAfter,
      r.totalAssets,
      r.decision,
      `"${r.reason.join('; ')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile('investment_calendar.csv', csvContent, 'text/csv;charset=utf-8;');
  }

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob(['\uFEFF' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { export: export_ };
})();

/** Export to Excel (.xlsx) using SheetJS */
const ExportExcel = (() => {
  function export_(records) {
    if (typeof XLSX === 'undefined') {
      alert('SheetJS library not loaded. Please check your internet connection.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Sheet 1: Calendar
    const calData = [
      ['Hari', 'Saldo Sebelum', 'Daily Income', 'Weekly Bonus', 'Generate',
       'Investasi', 'Lost Decimal', 'Investasi Cair', 'Aktif', 'Saldo Sesudah',
       'Total Aset', 'Keputusan', 'Alasan']
    ];
    records.forEach(r => {
      calData.push([
        r.day, r.balanceBefore, r.dailyIncome, r.weeklyBonus, r.generate,
        r.investedAmount, r.lostDecimal, r.maturedTotal, r.activeCount,
        r.balanceAfter, r.totalAssets, r.decision, r.reason.join('; ')
      ]);
    });
    const ws1 = XLSX.utils.aoa_to_sheet(calData);
    ws1['!cols'] = Array(13).fill({ wch: 15 });
    ws1['!cols'][12] = { wch: 60 }; // Wide column for reasons
    XLSX.utils.book_append_sheet(wb, ws1, 'Kalender Investasi');

    // Sheet 2: Invest Days Only
    const investData = [['Hari', 'Saldo Sebelum', 'Investasi', 'Return Hari', 'Expected Return', 'Alasan']];
    records.filter(r => r.flags.isInvestDay).forEach(r => {
      const matDay = r.day + (r.activeInvestments.find(i => i.startDay === r.day)?.maturityDay - r.day || 30);
      const expReturn = r.activeInvestments.find(i => i.startDay === r.day)?.expectedReturn || 0;
      investData.push([
        r.day, r.balanceBefore, r.investedAmount, matDay, expReturn, r.reason.join('; ')
      ]);
    });
    const ws2 = XLSX.utils.aoa_to_sheet(investData);
    ws2['!cols'] = [{ wch: 8 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 18 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Hari Investasi');

    XLSX.writeFile(wb, 'investment_calendar.xlsx');
  }

  return { export: export_ };
})();

/** Export to PDF using jsPDF + AutoTable */
const ExportPDF = (() => {
  function export_(records) {
    if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
      alert('jsPDF library not loaded. Please check your internet connection.');
      return;
    }

    const { jsPDF } = window.jspdf || window;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Title
    doc.setFontSize(18);
    doc.setTextColor(79, 172, 254);
    doc.text('Investment Calendar', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated: ${new Date().toLocaleDateString('id-ID')} — ${records.length} hari simulasi`, 14, 28);

    // Table
    const head = [['Hari', 'Saldo Sbl', 'Income', 'Bonus', 'Gen', 'Invest', 'Cair', 'Aktif', 'Saldo Ssd', 'Total Aset', 'Status']];
    const body = records.map(r => [
      r.day,
      r.balanceBefore,
      r.dailyIncome,
      r.weeklyBonus || '—',
      r.generate || '—',
      r.investedAmount || '—',
      r.maturedTotal || '—',
      r.activeCount,
      r.balanceAfter,
      r.totalAssets,
      r.decision,
    ]);

    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        head,
        body,
        startY: 35,
        styles: {
          fontSize: 7,
          cellPadding: 2,
          textColor: [226, 232, 240],
          fillColor: [22, 33, 62],
        },
        headStyles: {
          fillColor: [79, 172, 254],
          textColor: [15, 15, 26],
          fontStyle: 'bold',
        },
        alternateRowStyles: {
          fillColor: [26, 26, 46],
        },
        didParseCell: (data) => {
          const rowIdx = data.row.index;
          const record = records[rowIdx];
          if (!record) return;
          if (record.flags.isInvestDay) data.cell.styles.textColor = [16, 185, 129];
          if (record.flags.isMaturityDay) data.cell.styles.textColor = [245, 158, 11];
          if (record.flags.isDelayDay) data.cell.styles.textColor = [239, 68, 68];
        },
      });
    }

    doc.save('investment_calendar.pdf');
  }

  return { export: export_ };
})();
