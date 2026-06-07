export const resetSessionModel = local => {
  local.session.reset();
};
export const syncSessionModel = (local, msg) => {
  local.session.restore(msg);
};