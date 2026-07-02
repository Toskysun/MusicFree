import React from "react";
import Operations from "./operations";
import Sheets from "./sheets";
import HomeHero from "../HomeHero";

export default function HomeBody() {
    return (
        <Sheets
            header={
                <>
                    <HomeHero />
                    <Operations />
                </>
            }
        />
    );
}
