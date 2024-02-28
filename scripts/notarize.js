import 'dotenv/config';
import { notarize } from '@electron/notarize';

export default async function packageTask(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (process.env.DIST_ENV === 'development') {
    return;
  }

  console.log('Notarizing application...');

  const appName = context.packager.appInfo.productFilename;
  return await notarize({
    appBundleId: 'be.debleser.figment',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_PASSWORD,
    ascProvider: process.env.APPLE_ASC_PROVIDER,
  });
}
