// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-1-18

import { getActiveProject, load, makeProject, makeSeries, now, save } from './store-core.js';

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-22-27

export function listProjects() {
  const db = load();
  return Object.values(db.projects).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );
}

export function createProject(title = 'Untitled Novel') {
  const db = load();
  const project = makeProject((title || '').trim() || 'Untitled Novel');
  db.projects[project.id] = project;
  db.activeProjectId = project.id;
  save();
  return project;
}

export function switchProject(projectId) {
  const db = load();
  if (!db.projects[projectId] || projectId === db.activeProjectId) return null;
  db.activeProjectId = projectId;
// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-49-52
  if (db.projects[projectId]) db.projects[projectId].lastOpenedAt = now();
  save();
  return db.projects[projectId];
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-58-66
export function markProjectOpened() {
  const db = load();
  const project = db.projects[db.activeProjectId];
  if (project) {
    project.lastOpenedAt = now();
    save();
  }
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-76-80
export function deleteProject(projectId) {
  const db = load();
  const ids = Object.keys(db.projects);
  if (ids.length <= 1 || !db.projects[projectId]) return false;

  const wasActive = db.activeProjectId === projectId;
  const deletedProject = db.projects[projectId];
  delete db.projects[projectId];

  // Series pass — a deleted book's slot on its series' shelf goes with it,
  // but the series and its shared entities survive for the other member
  // books. Mirrors deleteEntity's "orphan, don't dangle" rule one level up.
  if (deletedProject.seriesId && db.series[deletedProject.seriesId]) {
    const series = db.series[deletedProject.seriesId];
    series.memberProjectIds = series.memberProjectIds.filter((id) => id !== projectId);
    series.updatedAt = now();
  }

  if (wasActive) {
    // Fall back to whichever remaining project was touched most recently,
    // same ordering listProjects() uses, so the switcher's top entry and
    // "what you land on after deleting the active one" always agree.
    const [next] = Object.values(db.projects).sort(
      (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
    );
    db.activeProjectId = next.id;
  }
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-112-118

export function listSeries() {
  const db = load();
  return Object.values(db.series).sort((a, b) => a.title.localeCompare(b.title));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-125-130
export function createSeries(title = 'Untitled Series') {
  const db = load();
  const series = makeSeries(title);
  db.series[series.id] = series;
  save();
  return series;
}

export function renameSeries(seriesId, title) {
  const series = getSeries(seriesId);
  if (!series) return null;
  series.title = (title || '').trim() || series.title;
  series.updatedAt = now();
  save();
  return series;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-148-153
export function addActiveProjectToSeries(seriesId) {
  const db = load();
  const project = getActiveProject();
  const series = db.series[seriesId];
  if (!series) return null;
  if (project.seriesId && db.series[project.seriesId]) {
    const oldSeries = db.series[project.seriesId];
    oldSeries.memberProjectIds = oldSeries.memberProjectIds.filter((id) => id !== project.id);
    oldSeries.updatedAt = now();
  }
  project.seriesId = series.id;
  if (!series.memberProjectIds.includes(project.id)) series.memberProjectIds.push(project.id);
  series.updatedAt = now();
  project.updatedAt = now();
  save();
  return series;
}

export function removeActiveProjectFromSeries() {
  const db = load();
  const project = getActiveProject();
  if (!project.seriesId) return false;
  const series = db.series[project.seriesId];
  if (series) {
    series.memberProjectIds = series.memberProjectIds.filter((id) => id !== project.id);
    series.updatedAt = now();
  }
  project.seriesId = null;
  project.updatedAt = now();
  save();
  return true;
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-187-193
export function deleteSeries(seriesId) {
  const db = load();
  const series = db.series[seriesId];
  if (!series) return false;
  series.memberProjectIds.forEach((projectId) => {
    const project = db.projects[projectId];
    if (project && project.seriesId === seriesId) project.seriesId = null;
  });
  delete db.series[seriesId];
  save();
  return true;
}

export function updateProjectMeta(patch) {
  const project = getActiveProject();
  Object.assign(project, patch, { updatedAt: now() });
  save();
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-213-219
export function getDistinctProjectValues(field) {
  const db = load();
  const values = new Set();
  Object.values(db.projects).forEach((p) => {
    const v = (p[field] || '').trim();
    if (v) values.add(v);
  });
  return [...values].sort((a, b) => a.localeCompare(b));
}

// Historical context: see docs/CODEBASE_NOTES.md#jsstore-projects-js-230-236
export function setCoverImage(imageId) {
  const project = getActiveProject();
  project.coverImageId = imageId || null;
  project.updatedAt = now();
  save();
}
