import { handleApiRequest } from '../../_lib/api-shell.mjs';
import { handleIdentityRuntime } from '../../_lib/identity/runtime-handler';
import { PLATFORM_DEPENDENCIES } from '../../_lib/runtime-dependencies.mjs';

export const onRequest: PagesFunction<Env, 'path'> = async (context) => {
    const identityResponse = await handleIdentityRuntime(context.request, context.env);
    if (identityResponse !== null) return identityResponse;
    return handleApiRequest(context.request, context.env, PLATFORM_DEPENDENCIES);
};
