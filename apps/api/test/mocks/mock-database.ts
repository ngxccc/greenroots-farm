import { mock } from "bun:test";
import type { DrizzleDB } from "@/database/database.module";

export function createMockDb(): DrizzleDB {
  let selectResult: unknown[] = [];
  let selectResultsQueue: unknown[][] = [];

  const mockInsertReturning = mock(() => {
    if (selectResultsQueue.length > 0) {
      const res = selectResultsQueue.shift();
      return Promise.resolve(res ?? selectResult);
    }
    return Promise.resolve(selectResult);
  });

  const mockInsertValues = mock(() =>
    Object.assign(Promise.resolve({}), {
      returning: mockInsertReturning,
      onConflictDoUpdate: mock(() => ({
        returning: mockInsertReturning,
      })),
      onConflictDoNothing: mock(() => ({
        returning: mockInsertReturning,
      })),
    }),
  );

  const mockUpdateReturning = mock(() => {
    if (selectResultsQueue.length > 0) {
      const res = selectResultsQueue.shift();
      return Promise.resolve(res ?? selectResult);
    }
    return Promise.resolve(selectResult);
  });

  const mockUpdateWhere = mock(() =>
    Object.assign(Promise.resolve({}), {
      returning: mockUpdateReturning,
    }),
  );

  const mockUpdateSet = mock(() => ({
    where: mockUpdateWhere,
  }));

  const mockUpdate = mock(() => ({
    set: mockUpdateSet,
  }));

  const mockDeleteReturning = mock(() => {
    if (selectResultsQueue.length > 0) {
      const res = selectResultsQueue.shift();
      return Promise.resolve(res ?? selectResult);
    }
    return Promise.resolve(selectResult);
  });

  const mockDeleteWhere = mock(() =>
    Object.assign(Promise.resolve({}), {
      returning: mockDeleteReturning,
    }),
  );

  const mockDelete = mock(() => ({
    where: mockDeleteWhere,
  }));

  const mockDb = {
    select: mock(() => {
      const getResult = () => {
        if (selectResultsQueue.length > 0) {
          const res = selectResultsQueue.shift();
          return Promise.resolve(res ?? selectResult);
        }
        return Promise.resolve(selectResult);
      };
      const qb: Record<string, unknown> = {
        then: (
          onfulfilled?: (value: unknown) => unknown,
          onrejected?: (reason: unknown) => unknown,
        ) => getResult().then(onfulfilled, onrejected),
      };
      const chainMethods = [
        "from",
        "where",
        "leftJoin",
        "innerJoin",
        "rightJoin",
        "fullJoin",
        "groupBy",
        "having",
        "orderBy",
        "limit",
        "offset",
        "for",
        "$dynamic",
      ];
      for (const method of chainMethods) {
        qb[method] = mock(() => qb);
      }
      return qb;
    }),
    insert: mock(() => ({
      values: mockInsertValues,
    })),
    update: mockUpdate,
    delete: mockDelete,
    execute: mock(() => Promise.resolve({ rows: [] })),
    transaction: mock((cb: (tx: unknown) => unknown) => cb(mockDb)),
    mockInsertValues,
    mockUpdateSet,
    mockUpdateWhere,
    mockDeleteWhere,
    setSelectResult(result: unknown[]) {
      selectResult = result;
    },
    setSelectResultsQueue(results: unknown[][]) {
      selectResultsQueue = results;
    },
    clearAll() {
      this.select.mockClear();
      this.insert.mockClear();
      this.mockInsertValues.mockClear();
      this.update.mockClear();
      this.mockUpdateSet.mockClear();
      this.mockUpdateWhere.mockClear();
      this.delete.mockClear();
      this.mockDeleteWhere.mockClear();
      this.transaction.mockClear();
      selectResult = [];
      selectResultsQueue = [];
    },
  };

  return mockDb;
}
