function sameId(a, b) {
  return String(a?._id || a) === String(b?._id || b);
}

function isProjectMember(project, userId) {
  return project.members.some(member => sameId(member, userId));
}

function canViewProject(project, user) {
  return user.role === 'Admin' || sameId(project.owner, user.id) || isProjectMember(project, user.id);
}

function canManageProject(project, user) {
  return user.role === 'Admin' || sameId(project.owner, user.id) || (user.role === 'Project Manager' && isProjectMember(project, user.id));
}

function isProjectParticipant(project, userId) {
  return sameId(project.owner, userId) || isProjectMember(project, userId);
}

module.exports = { sameId, isProjectMember, canViewProject, canManageProject, isProjectParticipant };
