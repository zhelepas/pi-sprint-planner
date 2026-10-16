import { state, workspace, activeProject, sprintLoad } from './state.js';
import { uiHandlers } from './actions.js';

export const board = document.getElementById('board');
export const refs = { sprints: new Map(), features: new Map(), backlogLoad: null, backlogTotal: null };
const configEl = document.getElementById('projectConfig');

export function jiraIssueHref(baseUrl, projectKey, ticketKey) {
    const cleanBase = (baseUrl || '').trim();
    const cleanProjectKey = (projectKey || '').trim();
    const cleanKey = (ticketKey || '').trim().replace(/\D/g, '');
    if (!cleanBase || !cleanKey) return null;
    const key = cleanProjectKey ? `${cleanProjectKey}-${cleanKey}` : cleanKey;
    const safeBase = cleanBase.replace(/\/+$/, '');
    return `${safeBase}/browse/${encodeURIComponent(key)}`;
}

export function jiraKeyLink(projectKey, ticketKey, baseUrl) {
    const cleanProjectKey = (projectKey || '').trim();
    const cleanKey = (ticketKey || '').trim().replace(/\D/g, '');
    if (!cleanProjectKey && !cleanKey) return null;
    const href = jiraIssueHref(baseUrl, cleanProjectKey, cleanKey);
    const link = document.createElement('a');
    link.className = 'jira-key-link';
    link.href = href || '#';
    link.target = href ? '_blank' : undefined;
    link.rel = href ? 'noopener noreferrer' : undefined;
    link.textContent = cleanProjectKey ? `${cleanProjectKey}-` : cleanKey || 'Jira';
    link.title = href ? `Open ${cleanProjectKey ? `${cleanProjectKey}-${cleanKey}` : cleanKey} in Jira` : 'Jira issue key';
    if (!href) {
        link.removeAttribute('target');
        link.removeAttribute('rel');
    }
    return link;
}

function syncIssueInput(projectKey, issueInput, baseUrl, value, keyRow) {
    const nextValue = (value || '').replace(/\D/g, '');
    if (issueInput.value !== nextValue) issueInput.value = nextValue;
    const prefix = keyRow.querySelector('.jira-key-link, .jira-key-placeholder');
    const q = projectKey ? `${projectKey}-` : 'Jira';
    const href = jiraIssueHref(baseUrl, projectKey, nextValue);
    if (projectKey) {
        const link = jiraKeyLink(projectKey, nextValue, baseUrl);
        if (link) {
            if (!prefix || prefix.className !== 'jira-key-link') {
                keyRow.replaceChildren(link, issueInput);
            } else {
                prefix.href = link.href;
                prefix.textContent = link.textContent;
                prefix.title = link.title;
            }
        } else {
            if (!prefix || prefix.className !== 'jira-key-placeholder') {
                const staticPrefix = document.createElement('span');
                staticPrefix.className = 'jira-key-placeholder';
                staticPrefix.textContent = `${projectKey}-`;
                keyRow.replaceChildren(staticPrefix, issueInput);
            } else {
                prefix.textContent = `${projectKey}-`;
            }
        }
    } else {
        if (!prefix || prefix.className !== 'jira-key-placeholder') {
            const fallback = document.createElement('span');
            fallback.className = 'jira-key-placeholder';
            fallback.textContent = 'JIRA-';
            keyRow.replaceChildren(fallback, issueInput);
        } else {
            prefix.textContent = 'JIRA-';
        }
    }
    return nextValue;
}

export function renderProjectConfig() {
    const project = activeProject();
    if (!project) {
        configEl.replaceChildren();
        return;
    }

    const jira = project.jira || {};
    configEl.replaceChildren(el('div', 'config-panel', panel => {
        panel.append(el('div', 'config-header', header => {
            header.textContent = 'Jira settings';
        }));

        const grid = el('div', 'config-grid');

        const jiraBaseUrl = document.createElement('label');
        jiraBaseUrl.className = 'config-field';
        jiraBaseUrl.innerHTML = '<span>Jira instance URL</span>';
        const baseField = document.createElement('input');
        baseField.type = 'url';
        baseField.placeholder = 'https://jira.example.com';
        baseField.value = jira.jiraBaseUrl || '';
        baseField.addEventListener('input', () => {
            project.jira = project.jira || {};
            project.jira.jiraBaseUrl = baseField.value.trim();
            uiHandlers.save?.();
            uiHandlers.renderBoard?.();
        });
        jiraBaseUrl.append(baseField);
        grid.append(jiraBaseUrl);

        const featureProjectKey = document.createElement('label');
        featureProjectKey.className = 'config-field';
        featureProjectKey.innerHTML = '<span>Feature project key</span>';
        const featureField = document.createElement('input');
        featureField.type = 'text';
        featureField.placeholder = 'PROJ';
        featureField.value = jira.featureProjectKey || '';
        featureField.addEventListener('input', () => {
            project.jira = project.jira || {};
            project.jira.featureProjectKey = featureField.value.trim();
            uiHandlers.save?.();
        });
        featureProjectKey.append(featureField);
        grid.append(featureProjectKey);

        const storyProjectKey = document.createElement('label');
        storyProjectKey.className = 'config-field';
        storyProjectKey.innerHTML = '<span>Story project key</span>';
        const storyField = document.createElement('input');
        storyField.type = 'text';
        storyField.placeholder = 'STORY';
        storyField.value = jira.storyProjectKey || '';
        storyField.addEventListener('input', () => {
            project.jira = project.jira || {};
            project.jira.storyProjectKey = storyField.value.trim();
            uiHandlers.save?.();
        });
        storyProjectKey.append(storyField);
        grid.append(storyProjectKey);

        panel.append(grid);
    }));
}

export function renderBoard() {
    refs.sprints.clear();
    refs.features.clear();
    board.style.gridTemplateColumns = `var(--feat-w) var(--col-w) repeat(${state.sprints.length}, var(--col-w))`;
    board.replaceChildren();

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

    state.features.forEach(feature => {
        board.append(featureCell(feature));
        board.append(dropCell(feature, null));
        state.sprints.forEach(sprint => board.append(dropCell(feature, sprint.id)));
    });

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
    renderProjectConfig();
}

export function sprintHeader(sprint) {
    return el('div', 'cell head col-head', c => {
        c.append(el('div', 'title-row', t => {
            const name = nameField('name', sprint.name, value => {
                sprint.name = value;
                uiHandlers.save?.();
            });
            t.append(name, iconButton('Remove sprint', () => uiHandlers.removeSprint?.(sprint.id)));
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
                uiHandlers.save?.();
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

export function featureCell(feature) {
    return el('div', 'cell feature-cell', c => {
        c.style.setProperty('--h', feature.hue);
        c.append(el('div', 'title-row', t => {
            const name = nameField('name', feature.name, value => {
                feature.name = value;
                uiHandlers.save?.();
            });
            t.append(name, iconButton('Remove feature', () => uiHandlers.removeFeature?.(feature.id)));
        }));
        const meta = el('div', 'feature-meta');
        refs.features.set(feature.id, meta);
        c.append(meta);

        const projectKey = activeProject()?.jira?.featureProjectKey || '';
        const keyRow = el('div', 'jira-key-row');
        const issueInput = document.createElement('input');
        issueInput.type = 'text';
        issueInput.inputMode = 'numeric';
        issueInput.pattern = '[0-9]*';
        issueInput.placeholder = 'Issue #';
        issueInput.className = 'jira-number-field';
        issueInput.value = feature.jiraKey || '';
        issueInput.addEventListener('input', () => {
            feature.jiraKey = issueInput.value.replace(/\D/g, '');
            if (issueInput.value !== feature.jiraKey) issueInput.value = feature.jiraKey;
            uiHandlers.save?.();
            syncIssueInput(projectKey, issueInput, activeProject()?.jira?.jiraBaseUrl || '', feature.jiraKey, keyRow);
        });
        syncIssueInput(projectKey, issueInput, activeProject()?.jira?.jiraBaseUrl || '', feature.jiraKey, keyRow);
        c.append(keyRow);

        const add = el('button', 'add-story', b => {
            b.type = 'button';
            b.textContent = '+ Story';
            b.addEventListener('click', () => uiHandlers.addStory?.(feature.id));
        });
        c.append(add);
    });
}

export function dropCell(feature, sprintId) {
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
        uiHandlers.moveStory?.(e.dataTransfer.getData('text/plain'), feature.id, sprintId);
    });
    return cell;
}

export function storyChip(story, feature) {
    const chip = el('div', 'story');
    chip.draggable = true;
    chip.dataset.storyId = story.id;
    chip.style.setProperty('--h', feature.hue);

    const handle = el('span', 'story-handle', node => {
        node.textContent = '⠿';
        node.setAttribute('aria-hidden', 'true');
    });

    const content = document.createElement('div');
    content.className = 'story-content';

    const titleRow = el('div', 'story-title-row');
    const title = nameField('story-title', story.title, value => {
        story.title = value;
        uiHandlers.save?.();
    });
    titleRow.append(title, iconButton('Remove story', () => uiHandlers.removeStory?.(story.id)));

    const keyRow = document.createElement('div');
    keyRow.className = 'story-key-row';
    const projectKey = activeProject()?.jira?.storyProjectKey || '';
    const issueInput = document.createElement('input');
    issueInput.type = 'text';
    issueInput.inputMode = 'numeric';
    issueInput.pattern = '[0-9]*';
    issueInput.placeholder = 'Issue #';
    issueInput.className = 'story-jira-key';
    issueInput.value = story.jiraKey || '';
    issueInput.addEventListener('input', () => {
        story.jiraKey = issueInput.value.replace(/\D/g, '');
        if (issueInput.value !== story.jiraKey) issueInput.value = story.jiraKey;
        uiHandlers.save?.();
        syncIssueInput(projectKey, issueInput, activeProject()?.jira?.jiraBaseUrl || '', story.jiraKey, keyRow);
    });
    syncIssueInput(projectKey, issueInput, activeProject()?.jira?.jiraBaseUrl || '', story.jiraKey, keyRow);

    const points = document.createElement('input');
    points.className = 'points';
    points.type = 'number';
    points.min = '0';
    points.step = '1';
    points.value = story.points;
    points.addEventListener('input', () => {
        story.points = Math.max(0, Number(points.value) || 0);
        uiHandlers.save?.();
        refreshTotals();
    });

    const metaRow = el('div', 'story-meta-row');
    metaRow.append(keyRow, points);

    [title, points].forEach(input => {
        input.addEventListener('pointerdown', () => { chip.draggable = false; });
        input.addEventListener('blur', () => { chip.draggable = true; });
    });

    content.append(titleRow, metaRow);
    chip.append(handle, content);

    chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', story.id);
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
    });
    chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

    return chip;
}

export function refreshTotals() {
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

export function el(tag, className, build) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (build) build(node);
    return node;
}

export function nameField(className, value, onChange) {
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

export function autosize(field) {
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
}

export function autosizeAll(fields) {
    const list = Array.from(fields);
    list.forEach(f => { f.style.height = 'auto'; });
    const heights = list.map(f => f.scrollHeight);
    list.forEach((f, i) => { f.style.height = `${heights[i]}px`; });
}

export function setText(node, value) {
    if (node.textContent !== value) node.textContent = value;
}

export function setClass(node, value) {
    if (node.className !== value) node.className = value;
}

export function setStyle(node, prop, value) {
    if (node.style[prop] !== value) node.style[prop] = value;
}

export function text(value) {
    return document.createTextNode(value);
}

export function iconButton(label, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.textContent = '✕';
    btn.addEventListener('click', onClick);
    return btn;
}

const tabsEl = document.getElementById('tabs');

export function renderTabs() {
    tabsEl.replaceChildren();

    workspace.projects.forEach(project => {
        const isActive = project.id === workspace.activeId;
        const tab = el('div', `tab${isActive ? ' active' : ''}`, t => {
            const open = el('button', 'tab-name', b => {
                b.type = 'button';
                b.textContent = project.name;
                b.title = 'Open project · double-click to rename';
                b.setAttribute('aria-current', String(isActive));
                b.addEventListener('click', () => uiHandlers.openProject?.(project.id));
                b.addEventListener('dblclick', () => uiHandlers.renameProject?.(project.id));
            });
            t.append(open);
            if (workspace.projects.length > 1) {
                t.append(iconButton(`Delete project ${project.name}`, () => uiHandlers.removeProject?.(project.id)));
            }
        });
        tabsEl.append(tab);
    });

    tabsEl.append(el('button', 'tab-add', b => {
        b.type = 'button';
        b.textContent = '+ Project';
        b.title = 'Add project';
        b.addEventListener('click', () => uiHandlers.addProject?.());
    }));

    document.title = `${activeProject().name} — PI Sprint Planner`;
}
