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
    board.append(el('div', 'cell row-total', c => { c.textContent = 'Total'; }));
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

    chip.append(title, points, iconButton('Remove story', () => removeStory(story.id)));

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

document.getElementById('exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pi-plan_${timestamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

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
