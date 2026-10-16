import { workspace, state, save, activeProject, defaultState, uid, findStory, sprintLoad, normalize, getState, setState, getWorkspace } from './state.js';

export const uiHandlers = {
    renderBoard: null,
    renderTabs: null,
    save: null,
    addFeature: null,
    removeFeature: null,
    addSprint: null,
    removeSprint: null,
    addStory: null,
    removeStory: null,
    moveStory: null,
    openProject: null,
    addProject: null,
    renameProject: null,
    removeProject: null,
    resetBoard: null
};

export function setViewCallbacks(callbacks) {
    Object.assign(uiHandlers, callbacks);
}

export function addFeature() {
    const current = getState();
    current.features.push({ id: uid(), name: `Feature ${current.features.length + 1}`, hue: nextHue(), jiraKey: '', stories: [] });
    save();
    uiHandlers.renderBoard?.();
}

export function removeFeature(featureId) {
    const current = getState();
    const feature = current.features.find(f => f.id === featureId);
    if (!feature) return;
    const suffix = feature.stories.length ? ` and its ${feature.stories.length} stories` : '';
    if (!confirm(`Delete feature "${feature.name}"${suffix}?`)) return;
    current.features = current.features.filter(f => f.id !== featureId);
    save();
    uiHandlers.renderBoard?.();
}

export function addSprint() {
    const current = getState();
    current.sprints.push({ id: uid(), name: `Sprint ${current.sprints.length + 1}`, capacity: 20 });
    save();
    uiHandlers.renderBoard?.();
}

export function removeSprint(sprintId) {
    const current = getState();
    const sprint = current.sprints.find(s => s.id === sprintId);
    if (!sprint) return;
    const planned = sprintLoad(sprintId);
    const suffix = planned ? ` Its ${planned} planned points move back to the backlog.` : '';
    if (!confirm(`Delete sprint "${sprint.name}"?${suffix}`)) return;
    current.features.forEach(f => f.stories.forEach(s => {
        if (s.sprintId === sprintId) s.sprintId = null;
    }));
    current.sprints = current.sprints.filter(s => s.id !== sprintId);
    save();
    uiHandlers.renderBoard?.();
}

export function addStory(featureId) {
    const current = getState();
    const feature = current.features.find(f => f.id === featureId);
    if (!feature) return;
    feature.stories.push({ id: uid(), title: `Story ${feature.stories.length + 1}`, points: 3, jiraKey: '', sprintId: null });
    save();
    uiHandlers.renderBoard?.();
}

export function removeStory(storyId) {
    const hit = findStory(storyId);
    if (!hit) return;
    if (!confirm(`Delete story "${hit.story.title}" (${hit.story.points} pts)?`)) return;
    hit.feature.stories = hit.feature.stories.filter(s => s.id !== storyId);
    save();
    uiHandlers.renderBoard?.();
}

export function moveStory(storyId, targetFeatureId, targetSprintId) {
    const current = getState();
    const hit = findStory(storyId);
    if (!hit) return;
    const target = current.features.find(f => f.id === targetFeatureId);
    if (!target) return;
    if (hit.feature !== target) {
        hit.feature.stories = hit.feature.stories.filter(s => s.id !== storyId);
        target.stories.push(hit.story);
    }
    hit.story.sprintId = targetSprintId || null;
    save();

    const chip = document.querySelector(`[data-story-id="${storyId}"]`);
    const cell = document.querySelector(`.drop[data-feature-id="${targetFeatureId}"][data-sprint-id="${targetSprintId || ''}"]`);
    if (!chip || !cell) {
        uiHandlers.renderBoard?.();
        return;
    }
    chip.style.setProperty('--h', target.hue);
    cell.append(chip);
    uiHandlers.renderBoard?.();
}

export function openProject(projectId) {
    const ws = getWorkspace();
    if (projectId === ws.activeId) return;
    const project = ws.projects.find(p => p.id === projectId);
    if (!project) return;
    ws.activeId = project.id;
    setState(project.board);
    save();
    uiHandlers.renderTabs?.();
    uiHandlers.renderBoard?.();
}

export function addProject() {
    const ws = getWorkspace();
    const project = {
        id: uid(),
        name: `Project ${ws.projects.length + 1}`,
        board: defaultState(),
        jira: {
            jiraBaseUrl: '',
            featureProjectKey: '',
            storyProjectKey: ''
        }
    };
    ws.projects.push(project);
    ws.activeId = project.id;
    setState(project.board);
    save();
    uiHandlers.renderTabs?.();
    uiHandlers.renderBoard?.();
}

export function renameProject(projectId) {
    const ws = getWorkspace();
    const project = ws.projects.find(p => p.id === projectId);
    if (!project) return;
    const name = prompt('Project name', project.name);
    if (name === null) return;
    project.name = name.trim() || project.name;
    save();
    uiHandlers.renderTabs?.();
}

export function removeProject(projectId) {
    const ws = getWorkspace();
    if (ws.projects.length < 2) return;
    const index = ws.projects.findIndex(p => p.id === projectId);
    if (index < 0) return;
    const project = ws.projects[index];
    if (!confirm(`Delete project "${project.name}" and everything in it?`)) return;

    ws.projects.splice(index, 1);
    if (ws.activeId === projectId) {
        const next = ws.projects[Math.min(index, ws.projects.length - 1)];
        ws.activeId = next.id;
        setState(next.board);
    }
    save();
    uiHandlers.renderTabs?.();
    uiHandlers.renderBoard?.();
}

export function resetBoard() {
    const currentProject = activeProject();
    if (!currentProject) return;
    if (!confirm(`Reset the board of "${currentProject.name}"?`)) return;
    const fresh = defaultState();
    currentProject.board = fresh;
    setState(fresh);
    save();
    uiHandlers.renderBoard?.();
}

function nextHue() {
    const current = getState();
    const used = new Set(current.features.map(f => f.hue));
    return [215, 145, 35, 280, 0, 190, 320, 95, 255, 15, 170, 45].find(h => !used.has(h)) ?? [215, 145, 35, 280, 0, 190, 320, 95, 255, 15, 170, 45][current.features.length % 12];
}

export function importProjectData(data) {
    const imported = normalize(data);
    if (!imported) throw new Error('bad shape');
    setState(imported);
    const currentProject = activeProject();
    if (currentProject) currentProject.board = imported;
    save();
    uiHandlers.renderBoard?.();
}
