import { RequestStateCode } from "@/constants/commonConst";
import { GlobalState } from "@/utils/stateMapper";

export interface ISearchCoverResult {
    data: IMusic.IMusicItem[];
    state: RequestStateCode;
    page: number;
}

interface ISearchCoverStoreData {
    query?: string;
    // plugin - result
    data: Record<string, ISearchCoverResult>;
}

export default new GlobalState<ISearchCoverStoreData>({ data: {} });
