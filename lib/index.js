// Host half: intentionally empty.
//
// The workgroup panel is a pure client tab: it reads the sessions service,
// the jobs service and better-sidebar's own /sidebar/api routes, so it owns
// no host route and no file on disk. The file stays so the plugin still
// mounts a host row (the DSH loader expects one).
export const name = "dsh-group-tab";

export function apply() {
  // no host services, no routes, no state
}
