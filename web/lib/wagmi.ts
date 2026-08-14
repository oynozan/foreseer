import { connectorsForWallets, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { flareTestnet } from "wagmi/chains";

const appName = "Foreseer";
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const hasWalletConnect = projectId !== "";

// walletconnect needs a project id, injected wallets do not
export const wagmiConfig = hasWalletConnect
    ? getDefaultConfig({
          appName,
          projectId,
          chains: [flareTestnet],
          ssr: true,
      })
    : createConfig({
          chains: [flareTestnet],
          connectors: connectorsForWallets([{ groupName: "Installed", wallets: [injectedWallet] }], {
              appName,
              projectId,
          }),
          transports: { [flareTestnet.id]: http() },
          ssr: true,
      });
