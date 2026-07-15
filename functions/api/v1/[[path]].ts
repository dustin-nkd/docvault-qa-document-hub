import { handleApiRequest } from '../../_lib/api-shell.mjs';
import { PLATFORM_DEPENDENCIES } from '../../_lib/runtime-dependencies.mjs';

export const onRequest: PagesFunction<Env, 'path'> = async (context) => {
    return handleApiRequest(context.request, context.env, PLATFORM_DEPENDENCIES);
};
