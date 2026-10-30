import { APP_NAME } from "@coverband/shared";
import { Guitar } from "lucide-react";
import { Resource } from "ra-core";
import { Admin } from "@/components/admin/admin";
import { BandList, BandShow } from "@/components/bands";
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
      <Resource
        name="bands"
        options={{ label: "Bands" }}
        list={BandList}
        show={BandShow}
        recordRepresentation="name"
        icon={Guitar}
      />
    </Admin>
  );
}
