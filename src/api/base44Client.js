import {configureExperienceTransport, instrumentClientExperience} from "@/components/systemHealth/clientExperienceMonitor";
import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';

const { appId, serverUrl, token, functionsVersion } = appParams;

//Create a client with authentication required
const rawClient = createClient({
  appId,
  serverUrl,
  token,
  functionsVersion,
  requiresAuth: false
});

configureExperienceTransport((name, data) => rawClient.functions.invoke(name, data));
export const base44 = instrumentClientExperience(rawClient);
