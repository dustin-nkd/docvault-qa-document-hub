import { handleApiRequest } from '../../_lib/api-shell.mjs';
import { handleIdentityRuntime } from '../../_lib/identity/runtime-handler';
import { handlePreviewCollaborationApi } from '../../_lib/collaboration/runtime-handler';
import { PLATFORM_DEPENDENCIES } from '../../_lib/runtime-dependencies.mjs';

export const onRequest: PagesFunction<Env, 'path'> = async (context) => {
    const identityResponse = await handleIdentityRuntime(context.request, context.env);
    if (identityResponse !== null) return identityResponse;
    const collaborationResponse = await handlePreviewCollaborationApi(context.request, context.env);
    if (collaborationResponse !== null) return collaborationResponse;
    return handleApiRequest(context.request, context.env, PLATFORM_DEPENDENCIES);
};
