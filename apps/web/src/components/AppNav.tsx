import { useLocation } from "react-router-dom";
import { Divider } from "@astryxdesign/core/Divider";
import { Icon } from "@astryxdesign/core/Icon";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import {
  SideNav,
  SideNavHeading,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { useOwnerCards } from "../api/hooks";
import { shortestAddress } from "../lib/format";
import { cardState } from "../lib/status";
import { useSession } from "../session/SessionProvider";
import { ActivityIcon, ChainIcon, OverviewIcon, PaymentsIcon, WalletIcon } from "./Icons";
import { DOT_VARIANT } from "./StatusToken";

/**
 * Primary navigation rail. Grouped console entries, then the owner's cards read
 * straight from the read API, then the owner session control. Cards appear only
 * once a session exists, because a card list is owner-scoped data.
 */
export function AppNav() {
  const { state, connect, disconnect } = useSession();
  const location = useLocation();
  const signedIn = state.status === "active";
  const cardsQuery = useOwnerCards(signedIn);
  const cards = cardsQuery.state.status === "ready" ? (cardsQuery.state.data?.cards ?? []) : [];
  const connecting = state.status === "connecting";

  return (
    <SideNav
      label="Pact console"
      collapsible
      header={
        <SideNavHeading
          heading="Pact"
          headingHref="/"
          icon={<NavIcon icon={<Icon icon={ChainIcon} size="sm" />} />}
        />
      }
      footer={
        <SideNavSection title="Owner session" isHeaderHidden>
          {signedIn ? (
            <>
              <SideNavItem label={shortestAddress(state.wallet)} icon={WalletIcon} isDisabled />
              <SideNavItem label="Disconnect" onClick={disconnect} />
            </>
          ) : (
            <SideNavItem
              label={connecting ? "Waiting for wallet…" : "Connect wallet"}
              icon={WalletIcon}
              isDisabled={connecting}
              onClick={() => {
                void connect();
              }}
            />
          )}
        </SideNavSection>
      }
    >
      <SideNavSection title="Console" isHeaderHidden>
        <SideNavItem
          label="Overview"
          href="/"
          icon={OverviewIcon}
          isSelected={location.pathname === "/"}
        />
        <SideNavItem
          label="Payments"
          href="/payments"
          icon={PaymentsIcon}
          isSelected={location.pathname.startsWith("/payments")}
        />
      </SideNavSection>
      <Divider />
      <SideNavSection title="Cards" isHeaderHidden>
        {cards.length === 0 ? (
          <SideNavItem
            label={signedIn ? "No cards for this wallet" : "Sign in to load cards"}
            icon={WalletIcon}
            isDisabled
          />
        ) : (
          cards.map((card) => {
            const view = cardState(card.status);
            return (
              <SideNavItem
                key={card.cardId}
                label={`Card ${card.cardId}`}
                href={`/cards/${card.cardId}`}
                icon={ActivityIcon}
                isSelected={location.pathname.startsWith(`/cards/${card.cardId}`)}
                endContent={<StatusDot variant={DOT_VARIANT[view.tone]} label={view.label} />}
              />
            );
          })
        )}
      </SideNavSection>
    </SideNav>
  );
}
