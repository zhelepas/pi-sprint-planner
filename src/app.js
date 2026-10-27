import { save } from './state.js';
import {
    addFeature,
    addProject,
    addSprint,
    addStory,
    importProjectData,
    moveStory,
    removeFeature,
    removeProject,
    removeSprint,
    removeStory,
    renameProject,
    resetBoard,
    setViewCallbacks,
    openProject,
} from './actions.js';
import { renderBoard, renderTabs } from './render.js';
import { exportCsv, exportJpg, exportJson, exportMarkdown, exportXlsx } from './exporters.js';
import { initTheme, toggleTheme } from './theme.js';

const exportMenu = document.getElementById('exportMenu');
const exportBtn = document.getElementById('exportBtn');
const exportList = exportMenu.querySelector('.menu-list');
const themeBtn = document.getElementById('themeBtn');
const importFile = document.getElementById('importFile');
const importBtn = document.getElementById('importBtn');

setViewCallbacks({
    renderBoard,
    renderTabs,
    save,
    addFeature,
    removeFeature,
    addSprint,
    removeSprint,
    addStory,
    removeStory,
    moveStory,
    openProject,
    addProject,
    renameProject,
    removeProject,
    resetBoard,
});

function toggleExportMenu(open) {
    exportList.hidden = !open;
    exportBtn.setAttribute('aria-expanded', String(open));
}

exportBtn.addEventListener('click', e => {
    e.stopPropagation();
    toggleExportMenu(exportList.hidden);
});

exportList.addEventListener('click', e => {
    const format = e.target.closest('[data-export]')?.dataset.export;
    if (!format) return;
    toggleExportMenu(false);
    const exporters = {
        json: exportJson,
        csv: exportCsv,
        xlsx: exportXlsx,
        md: exportMarkdown,
        jpg: exportJpg,
    };
    exporters[format]?.();
});

document.addEventListener('click', () => toggleExportMenu(false));
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') toggleExportMenu(false);
});

document.getElementById('addFeature').addEventListener('click', addFeature);
document.getElementById('addSprint').addEventListener('click', addSprint);
themeBtn.addEventListener('click', toggleTheme);
document.getElementById('resetBtn').addEventListener('click', resetBoard);

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        importProjectData(data);
    } catch (e) {
        alert('That file is not a valid PI plan export: ' + e.message);
    }
});

renderTabs();
renderBoard();
initTheme();
