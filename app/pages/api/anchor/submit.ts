import { postJsonRoute } from "../../../lib/server/apiRoute";
import { submitAnchor } from "../../../lib/server/anchorService";

export const config = { maxDuration: 60 };

export default postJsonRoute(submitAnchor);
