import {
  createRouter,
  createRootRoute,
  createRoute,
  Outlet,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { WidgetsPage } from './widgets/widgets'
import { WidgetBuilderPage } from './widgets/widget-builder'
import { WidgetViewPage } from './widgets/widget-view'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})

const widgetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widgets',
  component: WidgetsPage,
})

const widgetBuilderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widgets/new',
  component: WidgetBuilderPage,
})

const widgetViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/widgets/$widgetId',
  component: WidgetViewPage,
})

const routeTree = rootRoute.addChildren([widgetsRoute, widgetBuilderRoute, widgetViewRoute])

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
