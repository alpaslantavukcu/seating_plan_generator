// Step 4: downloads. Every export reads the current (possibly hand-edited)
// plan from the store; the export modules load on first use.

import { getState, set } from './store.js';
import { t } from './i18n.js';
import { renderGrid } from './grid.js';
import { placedCount } from './plan-ops.js';
import { showToast, rebuild, el } from './ui.js';

let classrooms = null;
let roomKey = null;

export function initExport(cls) {
  classrooms = cls;

  const wire = (id, module, fn) => {
    document.getElementById(id).addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (!getState().plan || btn.disabled) return;
      btn.disabled = true;
      btn.classList.add('busy');
      try {
        const mod = await import(module);
        await mod[fn](getState(), classrooms);
      } catch (err) {
        console.error(err);
        showToast(String(err.message || err), true);
      } finally {
        btn.disabled = false;
        btn.classList.remove('busy');
      }
    });
  };
  wire('exp-zip-all', './export-pdf.js', 'exportAllZip');
  wire('exp-pdf-room', './export-pdf.js', 'exportRoomPdf');
  wire('exp-xlsx-room', './export-xlsx.js', 'exportRoomXlsx');
  wire('exp-pdf-all-id', './export-pdf.js', 'exportMergedPdfId');
  wire('exp-pdf-all-full', './export-pdf.js', 'exportMergedPdfFull');
  wire('exp-pdf-all-tutanak', './export-pdf.js', 'exportMergedPdfTutanak');
  wire('exp-pdf-roomlist', './export-pdf.js', 'exportRoomListPdf');
  wire('exp-xlsx-roomlist', './export-xlsx.js', 'exportRoomListXlsx');

  document.getElementById('export-room').addEventListener('change', (e) => {
    set({ activeRoom: e.target.value });
  });

  // Print uses the step-3 grid (see print.css); draw it for the chosen room
  // first, since it is only redrawn while step 3 is on screen.
  document.getElementById('exp-print').addEventListener('click', () => {
    if (!getState().plan) return;
    renderGrid(getState(), classrooms);
    window.print();
  });
}

export function renderExport(s) {
  document.getElementById('ready-summary').textContent = t('readySummary', {
    exam: s.examName,
    rooms: s.selectedRooms.length,
    n: placedCount(s),
  });

  const select = document.getElementById('export-room');
  const key = `${s.selectedRooms.join(',')}|${s.activeRoom}`;
  if (key !== roomKey) {
    roomKey = key;
    rebuild(select, () => {
      for (const id of s.selectedRooms) {
        const option = el('option', null, id);
        option.value = id;
        select.appendChild(option);
      }
    });
    select.value = s.activeRoom;
  }
}
