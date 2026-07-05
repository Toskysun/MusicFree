import React from "react";
import Operations from "./operations";
import Sheets from "./sheets";
import HomeHero from "../HomeHero";
import { useAppConfig } from "@/core/appConfig";
import HomeOverview from "./homeOverview";

export default function HomeBody() {
    const homeLayout = useAppConfig("theme.homeLayout") ?? "classic";
    const hideHomeHeroCard = useAppConfig("theme.hideHomeHeroCard") ?? false;
    const hideHomeOperations = useAppConfig("theme.hideHomeOperations") ?? false;

    if (homeLayout === "overview") {
        return <HomeOverview />;
    }

    return (
        <Sheets
            header={
                <>
                    {!hideHomeHeroCard && <HomeHero />}
                    {!hideHomeOperations && <Operations />}
                </>
            }
        />
    );
}
