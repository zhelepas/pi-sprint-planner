const STORAGE_KEY = 'pi-sprint-planner-v1';
const THEME_KEY = 'pi-sprint-planner-theme';
const DEFAULT_CAPACITY = 20;
const HUES = [215, 145, 35, 280, 0, 190, 320, 95, 255, 15, 170, 45];

let state = load() || defaultState();

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

function nextHue() {
    const used = new Set(state.features.map(f => f.hue));
    return HUES.find(h => !used.has(h)) ?? HUES[state.features.length % HUES.length];
}

function defaultState() {
    return {
        sprints: Array.from({ length: 5 }, (_, i) => ({ id: uid(), name: `Sprint ${i + 1}`, capacity: DEFAULT_CAPACITY })),
        features: Array.from({ length: 3 }, (_, i) => ({ id: uid(), name: `Feature ${i + 1}`, hue: HUES[i], stories: [] }))
    };
}

let saveTimer = null;

function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(flushSave, 400);
}

function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) flushSave();
});
addEventListener('pagehide', () => {
    if (saveTimer) flushSave();
});

function load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return normalize(JSON.parse(raw));
    } catch {
        return null;
    }
}

function normalize(data) {
    if (!data || !Array.isArray(data.sprints) || !Array.isArray(data.features)) return null;
    data.features.forEach((f, i) => {
        if (typeof f.hue !== 'number') f.hue = HUES[i % HUES.length];
    });
    return data;
}

/* ---------- lookups ---------- */

function findStory(storyId) {
    for (const feature of state.features) {
        const story = feature.stories.find(s => s.id === storyId);
        if (story) return { feature, story };
    }
    return null;
}

function sprintLoad(sprintId) {
    return state.features.reduce((sum, f) =>
        sum + f.stories.filter(s => s.sprintId === sprintId).reduce((a, s) => a + (s.points || 0), 0), 0);
}

/* ---------- rendering ---------- */

const board = document.getElementById('board');
const refs = { sprints: new Map(), features: new Map(), backlogLoad: null, backlogTotal: null };

function render() {
    refs.sprints.clear();
    refs.features.clear();
    board.style.gridTemplateColumns = `var(--feat-w) var(--col-w) repeat(${state.sprints.length}, var(--col-w))`;
    board.replaceChildren();

    // header row
    board.append(el('div', 'cell head corner', c => {
        c.append(el('div', 'feature-meta', d => { d.textContent = 'Features / Sprints'; }));
    }));
    board.append(el('div', 'cell head col-head', c => {
        c.append(el('div', 'title-row', t => {
            const label = document.createElement('strong');
            label.textContent = 'Backlog';
            t.append(label);
        }));
        c.append(el('div', 'cap-row', r => {
            r.append(text('Unassigned: '));
            refs.backlogLoad = el('span', 'load');
            r.append(refs.backlogLoad);
        }));
    }));
    state.sprints.forEach(sprint => board.append(sprintHeader(sprint)));

    // feature rows
    state.features.forEach(feature => {
        board.append(featureCell(feature));
        board.append(dropCell(feature, null));
        state.sprints.forEach(sprint => board.append(dropCell(feature, sprint.id)));
    });

    // totals row
    board.append(el('div', 'cell row-total', c => { c.textContent = 'Total points'; }));
    board.append(el('div', 'cell total-cell', c => { refs.backlogTotal = c; }));
    state.sprints.forEach(sprint => board.append(el('div', 'cell total-cell', c => {
        const value = document.createElement('span');
        const note = document.createElement('small');
        c.append(value, note);
        Object.assign(refs.sprints.get(sprint.id), { total: c, totalValue: value, totalNote: note });
    })));

    refreshTotals();
    autosizeAll(board.querySelectorAll('textarea'));
}

function sprintHeader(sprint) {
    return el('div', 'cell head col-head', c => {
        c.append(el('div', 'title-row', t => {
            const name = nameField('name', sprint.name, value => { sprint.name = value; save(); });
            t.append(name, iconButton('Remove sprint', () => removeSprint(sprint.id)));
        }));
        c.append(el('div', 'cap-row', r => {
            r.append(text('Capacity'));
            const cap = document.createElement('input');
            cap.type = 'number';
            cap.min = '0';
            cap.step = '1';
            cap.value = sprint.capacity;
            cap.addEventListener('input', () => {
                sprint.capacity = Math.max(0, Number(cap.value) || 0);
                save();
                refreshTotals();
            });
            const load = el('span', 'load');
            r.append(cap, load);
            refs.sprints.set(sprint.id, { load });
        }));
        const bar = el('div', 'bar');
        const fill = document.createElement('span');
        bar.append(fill);
        c.append(bar);
        Object.assign(refs.sprints.get(sprint.id), { bar, barFill: fill });
    });
}

function featureCell(feature) {
    return el('div', 'cell feature-cell', c => {
        c.style.setProperty('--h', feature.hue);
        c.append(el('div', 'title-row', t => {
            const name = nameField('name', feature.name, value => { feature.name = value; save(); });
            t.append(name, iconButton('Remove feature', () => removeFeature(feature.id)));
        }));
        const meta = el('div', 'feature-meta');
        refs.features.set(feature.id, meta);
        c.append(meta);
        const add = el('button', 'add-story', b => {
            b.type = 'button';
            b.textContent = '+ Story';
            b.addEventListener('click', () => addStory(feature.id));
        });
        c.append(add);
    });
}

function dropCell(feature, sprintId) {
    const cell = el('div', `cell drop ${sprintId ? '' : 'backlog'}`);
    cell.dataset.featureId = feature.id;
    cell.dataset.sprintId = sprintId || '';

    feature.stories
        .filter(s => (s.sprintId || null) === sprintId)
        .forEach(s => cell.append(storyChip(s, feature)));

    cell.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!cell.classList.contains('dragover')) cell.classList.add('dragover');
    });
    cell.addEventListener('dragleave', () => cell.classList.remove('dragover'));
    cell.addEventListener('drop', e => {
        e.preventDefault();
        cell.classList.remove('dragover');
        moveStory(e.dataTransfer.getData('text/plain'), feature.id, sprintId);
    });
    return cell;
}

function storyChip(story, feature) {
    const chip = el('div', 'story');
    chip.draggable = true;
    chip.dataset.storyId = story.id;
    chip.style.setProperty('--h', feature.hue);

    const handle = el('span', 'story-handle', node => {
        node.textContent = '⠿';
        node.setAttribute('aria-hidden', 'true');
    });

    const title = nameField('story-title', story.title, value => { story.title = value; save(); });

    const points = document.createElement('input');
    points.className = 'points';
    points.type = 'number';
    points.min = '0';
    points.step = '1';
    points.value = story.points;
    points.addEventListener('input', () => {
        story.points = Math.max(0, Number(points.value) || 0);
        save();
        refreshTotals();
    });

    // let inputs receive focus/selection instead of starting a drag
    [title, points].forEach(input => {
        input.addEventListener('pointerdown', () => { chip.draggable = false; });
        input.addEventListener('blur', () => { chip.draggable = true; });
    });

    chip.append(handle, title, points, iconButton('Remove story', () => removeStory(story.id)));

    chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', story.id);
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

    return chip;
}

function refreshTotals() {
    state.sprints.forEach(sprint => {
        const ref = refs.sprints.get(sprint.id);
        if (!ref) return;
        const used = sprintLoad(sprint.id);
        const cap = sprint.capacity || 0;
        const status = used > cap ? 'over' : 'ok';
        const left = cap - used;

        setText(ref.load, `${used} / ${cap}`);
        setClass(ref.load, `load ${status}`);
        setClass(ref.bar, `bar ${status}`);
        setStyle(ref.barFill, 'width', cap ? `${Math.min(100, (used / cap) * 100)}%` : '0%');
        setClass(ref.total, `cell total-cell ${status}`);
        setText(ref.totalValue, String(used));
        setText(ref.totalNote, left >= 0 ? `${left} left` : `${Math.abs(left)} over`);
    });

    let backlogPoints = 0;
    state.features.forEach(feature => {
        let total = 0;
        let planned = 0;
        feature.stories.forEach(s => {
            const points = s.points || 0;
            total += points;
            if (s.sprintId) planned += points;
            else backlogPoints += points;
        });
        const meta = refs.features.get(feature.id);
        if (meta) setText(meta, `${feature.stories.length} stories · ${total} pts (${planned} planned)`);
    });

    if (refs.backlogLoad) setText(refs.backlogLoad, `${backlogPoints} pts`);
    if (refs.backlogTotal) setText(refs.backlogTotal, String(backlogPoints));
}

/* ---------- mutations ---------- */

function addFeature() {
    state.features.push({ id: uid(), name: `Feature ${state.features.length + 1}`, hue: nextHue(), stories: [] });
    save();
    render();
}

function removeFeature(featureId) {
    const feature = state.features.find(f => f.id === featureId);
    if (!feature) return;
    const suffix = feature.stories.length ? ` and its ${feature.stories.length} stories` : '';
    if (!confirm(`Delete feature "${feature.name}"${suffix}?`)) return;
    state.features = state.features.filter(f => f.id !== featureId);
    save();
    render();
}

function addSprint() {
    state.sprints.push({ id: uid(), name: `Sprint ${state.sprints.length + 1}`, capacity: DEFAULT_CAPACITY });
    save();
    render();
}

function removeSprint(sprintId) {
    const sprint = state.sprints.find(s => s.id === sprintId);
    if (!sprint) return;
    const planned = sprintLoad(sprintId);
    const suffix = planned ? ` Its ${planned} planned points move back to the backlog.` : '';
    if (!confirm(`Delete sprint "${sprint.name}"?${suffix}`)) return;
    state.features.forEach(f => f.stories.forEach(s => {
        if (s.sprintId === sprintId) s.sprintId = null;
    }));
    state.sprints = state.sprints.filter(s => s.id !== sprintId);
    save();
    render();
}

function addStory(featureId) {
    const feature = state.features.find(f => f.id === featureId);
    if (!feature) return;
    feature.stories.push({ id: uid(), title: `Story ${feature.stories.length + 1}`, points: 3, sprintId: null });
    save();
    render();
}

function removeStory(storyId) {
    const hit = findStory(storyId);
    if (!hit) return;
    if (!confirm(`Delete story "${hit.story.title}" (${hit.story.points} pts)?`)) return;
    hit.feature.stories = hit.feature.stories.filter(s => s.id !== storyId);
    save();
    render();
}

function moveStory(storyId, targetFeatureId, targetSprintId) {
    const hit = findStory(storyId);
    if (!hit) return;
    const target = state.features.find(f => f.id === targetFeatureId);
    if (!target) return;
    if (hit.feature !== target) {
        hit.feature.stories = hit.feature.stories.filter(s => s.id !== storyId);
        target.stories.push(hit.story);
    }
    hit.story.sprintId = targetSprintId || null;
    save();

    const chip = board.querySelector(`[data-story-id="${storyId}"]`);
    const cell = board.querySelector(`.drop[data-feature-id="${targetFeatureId}"][data-sprint-id="${targetSprintId || ''}"]`);
    if (!chip || !cell) {
        render();
        return;
    }
    chip.style.setProperty('--h', target.hue);
    cell.append(chip);
    refreshTotals();
}

/* ---------- helpers ---------- */

function el(tag, className, build) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (build) build(node);
    return node;
}

function nameField(className, value, onChange) {
    const field = document.createElement('textarea');
    field.className = className;
    field.rows = 1;
    field.value = value;
    field.addEventListener('input', () => {
        autosize(field);
        onChange(field.value);
    });
    field.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            field.blur();
        }
    });
    return field;
}

function autosize(field) {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
}

// one layout pass for the whole batch instead of a read/write cycle per field
function autosizeAll(fields) {
    const list = Array.from(fields);
    list.forEach(f => { f.style.height = 'auto'; });
    const heights = list.map(f => f.scrollHeight);
    list.forEach((f, i) => { f.style.height = `${heights[i]}px`; });
}

function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
}

function setClass(node, value) {
    if (node.className !== value) node.className = value;
}

function setStyle(node, prop, value) {
    if (node.style[prop] !== value) node.style[prop] = value;
}

function text(value) {
    return document.createTextNode(value);
}

function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function iconButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = '✕';
    btn.addEventListener('click', onClick);
    return btn;
}

/* ---------- toolbar ---------- */

document.getElementById('addFeature').addEventListener('click', addFeature);
document.getElementById('addSprint').addEventListener('click', addSprint);

const themeBtn = document.getElementById('themeBtn');

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    localStorage.setItem(THEME_KEY, theme);
}

themeBtn.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

applyTheme(localStorage.getItem(THEME_KEY)
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

document.getElementById('resetBtn').addEventListener('click', () => {
    if (!confirm('Reset the whole board?')) return;
    state = defaultState();
    save();
    render();
});

/* ---------- export ---------- */

const exportMenu = document.getElementById('exportMenu');
const exportBtn = document.getElementById('exportBtn');
const exportList = exportMenu.querySelector('.menu-list');

const exporters = {
    json: exportJson,
    csv: exportCsv,
    xlsx: exportXlsx,
    md: exportMarkdown,
    jpg: exportJpg
};

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
    exporters[format]();
});

document.addEventListener('click', () => toggleExportMenu(false));
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') toggleExportMenu(false);
});

// backlog first, then the sprints, so every export shares the board's column order
function columns() {
    return [{ id: null, name: 'Backlog', capacity: null }, ...state.sprints];
}

function storiesIn(feature, columnId) {
    return feature.stories.filter(s => (s.sprintId || null) === columnId);
}

function columnLoad(columnId) {
    return state.features.reduce((sum, f) =>
        sum + storiesIn(f, columnId).reduce((a, s) => a + (s.points || 0), 0), 0);
}

function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    download(blob, `pi-plan_${timestamp()}.json`);
}

function csvCell(value) {
    let field = String(value ?? '');
    // stop spreadsheets from evaluating a story title as a formula
    if (/^[=+\-@\t\r]/.test(field)) field = `'${field}`;
    return /[",\n\r]/.test(field) ? `"${field.replace(/"/g, '""')}"` : field;
}

// shared table shape for the spreadsheet exports
function grid() {
    const cols = columns();
    return {
        cols,
        header: ['Feature', ...cols.map(c => c.name)],
        capacity: ['Capacity', '', ...state.sprints.map(s => s.capacity || 0)],
        planned: ['Planned', columnLoad(null), ...state.sprints.map(s => sprintLoad(s.id))],
        rows: state.features.map(feature => ({
            feature,
            lists: cols.map(c => storiesIn(feature, c.id)
                .map(s => `${s.title} (${s.points || 0})`))
        })),
        total: ['Total points', ...cols.map(c => columnLoad(c.id))]
    };
}

function exportCsv() {
    const g = grid();
    const rows = [
        g.header,
        g.capacity,
        g.planned,
        ...g.rows.map(r => [r.feature.name, ...r.lists.map(l => l.join('\n'))]),
        g.total
    ];

    const csv = rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    download(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }), `pi-plan_${timestamp()}.csv`);
}

/* ---- XLSX: minimal OOXML package, zipped with stored (uncompressed) entries ---- */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[i] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

function zip(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const directory = [];
    let offset = 0;

    files.forEach(file => {
        const name = encoder.encode(file.name);
        const data = encoder.encode(file.data);
        const crc = crc32(data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 names
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, name.length, true);
        chunks.push(new Uint8Array(local.buffer), name, data);

        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014b50, true);
        entry.setUint16(4, 20, true);
        entry.setUint16(6, 20, true);
        entry.setUint16(8, 0x0800, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, data.length, true);
        entry.setUint32(24, data.length, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true);
        directory.push(new Uint8Array(entry.buffer), name);

        offset += 30 + name.length + data.length;
    });

    const dirSize = directory.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, dirSize, true);
    end.setUint32(16, offset, true);

    return new Blob([...chunks, ...directory, new Uint8Array(end.buffer)],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

function xmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

function hslHex(h, s, l) {
    const sat = s / 100;
    const lig = l / 100;
    const k = n => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = n => Math.round(255 * (lig - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
    return [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function colRef(index) {
    let ref = '';
    let n = index;
    do {
        ref = String.fromCharCode(65 + (n % 26)) + ref;
        n = Math.floor(n / 26) - 1;
    } while (n >= 0);
    return ref;
}

function sheetCell(colIndex, rowIndex, value, styleIndex) {
    const ref = `${colRef(colIndex)}${rowIndex}`;
    if (typeof value === 'number') return `<c r="${ref}" s="${styleIndex}"><v>${value}</v></c>`;
    if (value === '' || value == null) return `<c r="${ref}" s="${styleIndex}"/>`;
    return `<c r="${ref}" s="${styleIndex}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

// the sheet always uses the light palette so it stays readable in Excel
const XLSX_CHIP = { s: 72, l: 92, border: 78 };

function exportXlsx() {
    const g = grid();
    const width = g.header.length;

    const fills = ['<fill><patternFill patternType="none"/></fill>',
        '<fill><patternFill patternType="gray125"/></fill>',
        solidFill('FFDCE4EE'), solidFill('FFEEF2F7')];
    const cellXfs = [
        '<xf numFmtId="0" xfId="0" fontId="0" fillId="0" borderId="0"/>',
        '<xf numFmtId="0" xfId="0" fontId="1" fillId="2" borderId="1" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
        '<xf numFmtId="0" xfId="0" fontId="1" fillId="3" borderId="1" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>',
        '<xf numFmtId="0" xfId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>'
    ];
    const STYLE = { header: 1, label: 2, number: 3 };

    // two style slots per feature: the name cell and its story cells
    const featureStyles = g.rows.map(({ feature }) => {
        const nameFill = fills.push(solidFill(`FF${hslHex(feature.hue, XLSX_CHIP.s, XLSX_CHIP.border)}`)) - 1;
        const cellFill = fills.push(solidFill(`FF${hslHex(feature.hue, XLSX_CHIP.s, XLSX_CHIP.l)}`)) - 1;
        const name = cellXfs.push(`<xf numFmtId="0" xfId="0" fontId="1" fillId="${nameFill}" borderId="1" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`) - 1;
        const cell = cellXfs.push(`<xf numFmtId="0" xfId="0" fontId="0" fillId="${cellFill}" borderId="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`) - 1;
        return { name, cell };
    });

    const sheetRows = [];
    let r = 0;

    const row = (cells, { height } = {}) => {
        r++;
        const attrs = height ? ` ht="${height}" customHeight="1"` : '';
        sheetRows.push(`<row r="${r}"${attrs}>${cells.map((c, i) => sheetCell(i, r, c.v, c.s)).join('')}</row>`);
    };

    row(g.header.map(v => ({ v, s: STYLE.header })), { height: 22 });
    row(g.capacity.map((v, i) => ({ v, s: i === 0 ? STYLE.label : STYLE.number })));
    row(g.planned.map((v, i) => ({ v, s: i === 0 ? STYLE.label : STYLE.number })));

    // one row per story, so a sprint column holds one story per Excel row
    const merges = [];
    g.rows.forEach((item, i) => {
        const style = featureStyles[i];
        const points = item.feature.stories.reduce((a, s) => a + (s.points || 0), 0);
        const name = `${item.feature.name}\n${item.feature.stories.length} stories · ${points} pts`;
        const count = Math.max(1, ...item.lists.map(l => l.length));
        const start = r + 1;

        for (let n = 0; n < count; n++) {
            row([
                { v: n === 0 ? name : '', s: style.name },
                ...item.lists.map(list => ({ v: list[n] ?? '', s: style.cell }))
            ], count === 1 ? { height: 32 } : undefined);
        }
        if (count > 1) merges.push(`A${start}:A${start + count - 1}`);
    });

    row(g.total.map(v => ({ v, s: STYLE.label })));

    const mergeXml = merges.length
        ? `<mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
        : '';

    const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="${width}" width="30" customWidth="1"/></cols><sheetData>${sheetRows.join('')}</sheetData>${mergeXml}</worksheet>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB8C2CC"/></left><right style="thin"><color rgb="FFB8C2CC"/></right><top style="thin"><color rgb="FFB8C2CC"/></top><bottom style="thin"><color rgb="FFB8C2CC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs></styleSheet>`;

    const files = [
        {
            name: '[Content_Types].xml',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
        },
        {
            name: '_rels/.rels',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
        },
        {
            name: 'xl/workbook.xml',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PI Plan" sheetId="1" r:id="rId1"/></sheets></workbook>`
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
        },
        { name: 'xl/styles.xml', data: styles },
        { name: 'xl/worksheets/sheet1.xml', data: sheet }
    ];

    download(zip(files), `pi-plan_${timestamp()}.xlsx`);
}

function solidFill(argb) {
    return `<fill><patternFill patternType="solid"><fgColor rgb="${argb}"/><bgColor indexed="64"/></patternFill></fill>`;
}

function mdCell(value) {
    return String(value ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
}

function exportMarkdown() {
    const cols = columns();
    const header = ['Feature', ...cols.map(c => c.id
        ? `${c.name} (${columnLoad(c.id)}/${c.capacity || 0} pts)`
        : `${c.name} (${columnLoad(null)} pts)`)];

    const lines = [
        `| ${header.map(mdCell).join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`
    ];

    state.features.forEach(feature => {
        const cells = cols.map(c => storiesIn(feature, c.id)
            .map(s => `${mdCell(s.title)} (${s.points || 0})`)
            .join(', '));
        lines.push(`| ${mdCell(feature.name)} | ${cells.join(' | ')} |`);
    });

    lines.push(`| Total | ${cols.map(c => columnLoad(c.id)).join(' | ')} |`);

    const md = `# PI Plan — ${new Date().toLocaleString()}\n\n${lines.join('\n')}\n`;
    download(new Blob([md], { type: 'text/markdown;charset=utf-8' }), `pi-plan_${timestamp()}.md`);
}

/* ---- JPG: the board is redrawn on a canvas so the image is not clipped by scroll ---- */

const IMG = {
    scale: 2,
    pad: 16,
    gap: 8,
    featW: 220,
    colW: 240,
    totalH: 44,
    cellPad: 8,
    chipPad: 6,
    chipGap: 4,
    lineH: 16
};

function css(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function fontUi(size, weight = 400) {
    return `${weight} ${size}px ${css('--font-ui') || 'sans-serif'}`;
}

function fontData(size, weight = 700) {
    return `${weight} ${size}px ${css('--font-data') || 'monospace'}`;
}

// greedy word wrap; long unbroken words are split so nothing overflows the cell
function wrap(ctx, value, maxWidth) {
    const words = String(value ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let line = '';
    const push = () => { if (line) lines.push(line); line = ''; };

    words.forEach(word => {
        let candidate = line ? `${line} ${word}` : word;
        if (ctx.measureText(candidate).width <= maxWidth) {
            line = candidate;
            return;
        }
        push();
        line = word;
        while (ctx.measureText(line).width > maxWidth && line.length > 1) {
            let cut = line.length - 1;
            while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > maxWidth) cut--;
            lines.push(line.slice(0, cut));
            line = line.slice(cut);
        }
    });
    push();
    return lines.length ? lines : [''];
}

function drawLines(ctx, lines, x, y, color) {
    ctx.fillStyle = color;
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * IMG.lineH));
    return lines.length * IMG.lineH;
}

function exportJpg() {
    const cols = columns();
    const colors = {
        bg: css('--bg') || '#fff',
        surface: css('--surface'),
        line: css('--line'),
        text: css('--text'),
        muted: css('--muted'),
        total: css('--total-bg'),
        ok: css('--ok'),
        over: css('--over'),
        chipS: css('--chip-s'),
        chipL: css('--chip-l'),
        chipBorderL: css('--chip-border-l')
    };

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';

    // ---- measure pass ----
    const chipTextW = IMG.colW - IMG.cellPad * 2 - 16;

    const layout = state.features.map(feature => {
        ctx.font = fontUi(13, 700);
        const nameLines = wrap(ctx, feature.name, IMG.featW - IMG.cellPad * 2 - 4);
        const featureH = IMG.cellPad * 2 + nameLines.length * IMG.lineH + 20;

        const cells = cols.map(column => storiesIn(feature, column.id).map(story => {
            ctx.font = fontData(12);
            const pointsW = ctx.measureText(String(story.points || 0)).width;
            ctx.font = fontUi(12);
            const lines = wrap(ctx, story.title, chipTextW - pointsW - 8);
            return { story, lines, pointsW, h: IMG.chipPad * 2 + lines.length * IMG.lineH };
        }));

        const cellHeights = cells.map(chips => chips.length
            ? IMG.cellPad * 2 + chips.reduce((a, c) => a + c.h, 0) + (chips.length - 1) * IMG.chipGap
            : 0);

        return { feature, nameLines, cells, h: Math.max(featureH, ...cellHeights, 48) };
    });

    ctx.font = fontUi(13, 700);
    const headerCols = cols.map(column => {
        const used = columnLoad(column.id);
        return {
            column,
            used,
            nameLines: wrap(ctx, column.name, IMG.colW - IMG.cellPad * 2),
            detail: column.id ? `${used} / ${column.capacity || 0} pts` : `Unassigned: ${used} pts`,
            over: Boolean(column.id) && used > (column.capacity || 0)
        };
    });
    const headH = IMG.cellPad * 2 + Math.max(...headerCols.map(h => h.nameLines.length)) * IMG.lineH + IMG.lineH + 4;

    // ---- draw pass ----
    const width = IMG.pad * 2 + IMG.featW + cols.length * (IMG.colW + IMG.gap);
    const height = IMG.pad * 2 + headH + IMG.totalH
        + layout.reduce((a, r) => a + r.h, 0) + (layout.length + 1) * IMG.gap;

    canvas.width = width * IMG.scale;
    canvas.height = height * IMG.scale;
    ctx.scale(IMG.scale, IMG.scale);
    ctx.textBaseline = 'top';

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    const colX = i => IMG.pad + IMG.featW + IMG.gap + i * (IMG.colW + IMG.gap);

    const box = (x, y, w, h, fill) => {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    };

    let y = IMG.pad;

    // header row
    box(IMG.pad, y, IMG.featW, headH, colors.surface);
    ctx.font = fontUi(13, 700);
    drawLines(ctx, ['Features / Sprints'], IMG.pad + IMG.cellPad, y + IMG.cellPad, colors.text);
    headerCols.forEach((head, i) => {
        const x = colX(i);
        box(x, y, IMG.colW, headH, colors.surface);
        ctx.font = fontUi(13, 700);
        const used = drawLines(ctx, head.nameLines, x + IMG.cellPad, y + IMG.cellPad, colors.text);
        ctx.font = fontUi(12);
        drawLines(ctx, [head.detail], x + IMG.cellPad, y + IMG.cellPad + used + 4,
            head.over ? colors.over : colors.muted);
    });
    y += headH + IMG.gap;

    // feature rows
    layout.forEach(row => {
        const { feature, h } = row;
        box(IMG.pad, y, IMG.featW, h, colors.surface);
        ctx.fillStyle = `hsl(${feature.hue} ${colors.chipS} ${colors.chipBorderL})`;
        ctx.fillRect(IMG.pad, y, 4, h);

        ctx.font = fontUi(13, 700);
        const nameH = drawLines(ctx, row.nameLines, IMG.pad + IMG.cellPad + 4, y + IMG.cellPad, colors.text);
        const pts = feature.stories.reduce((a, s) => a + (s.points || 0), 0);
        ctx.font = fontUi(12);
        drawLines(ctx, [`${feature.stories.length} stories · ${pts} pts`],
            IMG.pad + IMG.cellPad + 4, y + IMG.cellPad + nameH + 2, colors.muted);

        row.cells.forEach((chips, i) => {
            const x = colX(i);
            box(x, y, IMG.colW, h, colors.surface);
            let cy = y + IMG.cellPad;
            chips.forEach(chip => {
                const cw = IMG.colW - IMG.cellPad * 2;
                ctx.fillStyle = `hsl(${feature.hue} ${colors.chipS} ${colors.chipL})`;
                ctx.fillRect(x + IMG.cellPad, cy, cw, chip.h);
                ctx.strokeStyle = `hsl(${feature.hue} ${colors.chipS} ${colors.chipBorderL})`;
                ctx.strokeRect(x + IMG.cellPad + 0.5, cy + 0.5, cw - 1, chip.h - 1);

                ctx.font = fontUi(12);
                drawLines(ctx, chip.lines, x + IMG.cellPad + 8, cy + IMG.chipPad, colors.text);
                ctx.font = fontData(12);
                ctx.fillStyle = colors.text;
                ctx.fillText(String(chip.story.points || 0),
                    x + IMG.cellPad + cw - 8 - chip.pointsW, cy + IMG.chipPad);

                cy += chip.h + IMG.chipGap;
            });
        });
        y += h + IMG.gap;
    });

    // totals row
    box(IMG.pad, y, IMG.featW, IMG.totalH, colors.total);
    ctx.font = fontUi(13, 700);
    drawLines(ctx, ['Total points'], IMG.pad + IMG.cellPad, y + 12, colors.text);
    cols.forEach((column, i) => {
        const x = colX(i);
        const used = columnLoad(column.id);
        const over = column.id && used > (column.capacity || 0);
        box(x, y, IMG.colW, IMG.totalH, colors.total);
        ctx.font = fontUi(15, 700);
        ctx.fillStyle = over ? colors.over : colors.ok;
        const usedW = ctx.measureText(String(used)).width;
        ctx.fillText(String(used), x + IMG.cellPad, y + 10);
        if (column.id) {
            const left = (column.capacity || 0) - used;
            ctx.font = fontUi(12);
            ctx.fillStyle = colors.muted;
            ctx.fillText(left >= 0 ? `${left} left` : `${Math.abs(left)} over`,
                x + IMG.cellPad + usedW + 10, y + 14);
        }
    });

    canvas.toBlob(blob => {
        if (blob) download(blob, `pi-plan_${timestamp()}.jpg`);
    }, 'image/jpeg', 0.92);
}

const importFile = document.getElementById('importFile');
document.getElementById('importBtn').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    importFile.value = '';
    if (!file) return;
    try {
        const data = JSON.parse(await file.text());
        const imported = normalize(data);
        if (!imported) throw new Error('bad shape');
        state = imported;
        save();
        render();
    } catch {
        alert('That file is not a valid PI plan export.');
    }
});

render();
