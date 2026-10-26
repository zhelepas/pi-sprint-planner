export const STORAGE_KEY = 'pi-sprint-planner-projects-v1';
export const LEGACY_STORAGE_KEY = 'pi-sprint-planner-v1';
export const THEME_KEY = 'pi-sprint-planner-theme';
export const DEFAULT_CAPACITY = 20;
export const HUES = [215, 145, 35, 280, 0, 190, 320, 95, 255, 15, 170, 45];

export let workspace = loadWorkspace();
export let state = activeProject() ? activeProject().board : defaultState();

let saveTimer = null;

export function getState() {
    return state;
}

export function setState(nextState) {
    state = nextState;
    const project = activeProject();
    if (project) project.board = nextState;
}

export function getWorkspace() {
    return workspace;
}

export function setWorkspace(nextWorkspace) {
    workspace = nextWorkspace;
    const project = activeProject();
    state = project ? project.board : defaultState();
}

export function uid() {
    return Math.random().toString(36).slice(2, 10);
}

export function nextHue() {
    const current = getState();
    const used = new Set(current.features.map(f => f.hue));
    return HUES.find(h => !used.has(h)) ?? HUES[current.features.length % HUES.length];
}

export function defaultProjectJira() {
    return {
        jiraBaseUrl: '',
        featureProjectKey: '',
        storyProjectKey: ''
    };
}

export function defaultState() {
    return {
        sprints: Array.from({ length: 5 }, (_, i) => ({ id: uid(), name: `Sprint ${i + 1}`, capacity: DEFAULT_CAPACITY })),
        features: Array.from({ length: 3 }, (_, i) => ({ id: uid(), name: `Feature ${i + 1}`, hue: HUES[i], jiraKey: '', stories: [] }))
    };
}

export function newProject(name) {
    return { id: uid(), name, board: defaultState(), jira: defaultProjectJira() };
}

export function activeProject() {
    if (!workspace || !Array.isArray(workspace.projects) || !workspace.projects.length) return null;
    return workspace.projects.find(p => p.id === workspace.activeId) ?? workspace.projects[0];
}

export function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(flushSave, 400);
}

export function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) flushSave();
});
addEventListener('pagehide', () => {
    if (saveTimer) flushSave();
});

export function loadWorkspace() {
    const stored = read(STORAGE_KEY, normalizeWorkspace);
    if (stored) return stored;

    const legacy = read(LEGACY_STORAGE_KEY, normalize);
    const first = newProject('Project 1');
    if (legacy) first.board = legacy;
    return { activeId: first.id, projects: [first] };
}

export function read(key, parse) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? parse(JSON.parse(raw)) : null;
    } catch {
        return null;
    }
}

export function normalizeProject(project) {
    const board = normalize(project?.board);
    if (!board) return null;
    const jira = project?.jira && typeof project.jira === 'object' ? project.jira : {};
    return {
        id: project?.id || uid(),
        name: String(project?.name || 'Project'),
        board,
        jira: {
            jiraBaseUrl: typeof jira.jiraBaseUrl === 'string' ? jira.jiraBaseUrl.trim() : '',
            featureProjectKey: typeof jira.featureProjectKey === 'string' ? jira.featureProjectKey.trim() : '',
            storyProjectKey: typeof jira.storyProjectKey === 'string' ? jira.storyProjectKey.trim() : ''
        }
    };
}

export function normalizeWorkspace(data) {
    if (!data || !Array.isArray(data.projects)) return null;
    const projects = data.projects.reduce((list, p) => {
        const project = normalizeProject(p);
        if (project) list.push(project);
        return list;
    }, []);
    if (!projects.length) return null;
    const activeId = projects.some(p => p.id === data.activeId) ? data.activeId : projects[0].id;
    return { activeId, projects };
}

export function normalizeIssueKey(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const explicit = raw.toUpperCase().match(/^([A-Z][A-Z0-9_]*)-(\d+)$/);
    if (explicit) return explicit[2];
    const digits = raw.toUpperCase().match(/(\d+)$/);
    return digits ? digits[1] : '';
}

export function normalize(data) {
    if (!data || !Array.isArray(data.sprints) || !Array.isArray(data.features)) return null;
    data.features.forEach((f, i) => {
        if (!Array.isArray(f.stories)) f.stories = [];
        if (typeof f.hue !== 'number') f.hue = HUES[i % HUES.length];
        if (typeof f.jiraKey !== 'string') f.jiraKey = '';
        f.jiraKey = normalizeIssueKey(f.jiraKey);
        f.stories.forEach(story => {
            if (typeof story.jiraKey !== 'string') story.jiraKey = '';
            story.jiraKey = normalizeIssueKey(story.jiraKey);
            if (typeof story.points !== 'number') story.points = Number(story.points) || 0;
        });
    });
    return data;
}

export function findStory(storyId) {
    const current = getState();
    for (const feature of current.features) {
        const story = feature.stories.find(s => s.id === storyId);
        if (story) return { feature, story };
    }
    return null;
}

export function sprintLoad(sprintId) {
    const current = getState();
    return current.features.reduce((sum, f) =>
        sum + f.stories.filter(s => s.sprintId === sprintId).reduce((a, s) => a + (s.points || 0), 0), 0);
}

export function timestamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function fileBase() {
    const project = activeProject();
    const slug = project && project.name
        ? project.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        : 'project';
    return `pi-plan_${slug || 'project'}_${timestamp()}`;
}
