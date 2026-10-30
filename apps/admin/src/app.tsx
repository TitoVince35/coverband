import { APP_NAME } from "@coverband/shared";
import { CustomRoutes } from "ra-core";
import { Admin } from "@/components/admin/admin";
import { Dashboard } from "@/components/dashboard";
import { authProvider } from "@/lib/auth-provider";
import { dataProvider } from "@/lib/data-provider";

/** The admin console (#246): Shadcn Admin Kit on our `/api/admin` routes, admins only. */
export function App() {
  return (
    <Admin
      title={`${APP_NAME} admin`}
      authProvider={authProvider}
      dataProvider={dataProvider}
      dashboard={Dashboard}
      requireAuth
      // It would load an image from Marmelab's server, which the security policy blocks anyway.
      disableTelemetry
    >
      {/* Not empty, so the homepage shows before the first resource exists (bands: #247). */}
      <CustomRoutes>{[]}</CustomRoutes>
    </Admin>
  );
}
