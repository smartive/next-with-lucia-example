import { useEffect } from "react";

export const useAsyncEffect = (
  cb: () => Promise<unknown>,
  deps?: React.DependencyList
) => {
  useEffect(() => {
    cb();
  }, deps);
};
