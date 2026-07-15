import { handleApiRequest } from '../../_lib/api-shell.mjs';

export const onRequest: PagesFunction<Env, 'path'> = async (context) => {
    return handleApiRequest(context.request, context.env);
};
