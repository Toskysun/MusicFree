import React from "react";
import Operations from "./operations";
import Sheets from "./sheets";
import HomeHero from "../HomeHero";
import { useAppConfig } from "@/core/appConfig";

export default function HomeBody() {
    const hideHomeHeroCard = useAppConfig("theme.hideHomeHeroCard") ?? false;
    const hideHomeOperations = useAppConfig("theme.hideHomeOperations") ?? false;

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
