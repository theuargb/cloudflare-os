import type { Tour } from '@gadgets/workshop-shared/tour'
import type { TourRequest } from './tourStore'

/**
 * The Workshop home tour: the sidebar and the home page. The topbar is left to the tours of the apps
 * that fill it (workplaces, menu, inbox). Steps whose anchor is not on screen are skipped, so the
 * desktop sidebar steps and the mobile menu-button step never show together.
 */
export const HOME_TOUR: Tour = {
  id: 'home',
  version: 1,
  steps: [
    {
      title: 'A quick tour',
      body: 'Here is where everything lives. Use → and ← to move between steps, Esc to leave.',
    },
    {
      target: { host: 'sidebar-modules' },
      side: 'right',
      title: 'Modules',
      body: 'Your modules, grouped by business area. Click a group title to fold it; in the expanded sidebar, drag rows to reorder them and use the pencil to rename.',
    },
    {
      target: { host: 'sidebar-workspaces' },
      side: 'right',
      title: 'Workspaces',
      body: 'Apps, outputs and conversations you create with the assistant. Star a workspace to keep it in Favorites.',
    },
    {
      target: { host: 'sidebar-toggle' },
      side: 'right',
      title: 'Sidebar width',
      body: 'Collapse the sidebar to a narrow rail when you need more room, and expand it again with the same button.',
    },
    {
      target: { host: 'sidebar-utilities' },
      side: 'right',
      title: 'Connections, theme, profile',
      body: 'The plug opens your connected services. Next to it: light or dark theme, and your profile menu, where you can replay this tour.',
    },
    {
      target: { host: 'menu-button' },
      side: 'bottom',
      title: 'Navigation',
      body: 'This button opens the sidebar with your modules and workspaces.',
    },
    {
      target: { host: 'home-composer' },
      side: 'bottom',
      title: 'Assistant',
      body: "Ask a question or describe a task in your own words. The assistant works with your modules' data, prepares outputs and builds apps.",
    },
    {
      target: { host: 'home-quick-actions' },
      side: 'top',
      title: 'Quick actions',
      body: 'Your recent and featured actions across modules. Start typing above and they turn into matching actions.',
    },
    {
      target: { host: 'home-suggestions' },
      side: 'top',
      title: 'Example tasks',
      body: 'Not sure where to start? Pick an example and it lands in the box above.',
    },
    {
      title: "You're all set",
      body: 'Open a module from the sidebar to see how its screens work. Replay this tour any time from your profile menu.',
    },
  ],
}

export const homeTourRequest = (replay: boolean): TourRequest => ({
  key: 'home',
  tour: HOME_TOUR,
  route: { kind: 'home' },
  replay,
  locateFrame: null,
})
