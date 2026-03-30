import { Effect, FileSystem, Layer, ServiceMap, Stream } from "effect";
import { NodeServices } from "@effect/platform-node";

export class Tail extends ServiceMap.Service<Tail>()("@supervisor/Tail", {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;

    const stream = (filePath: string) => {
      let offset = 0;

      const readNewBytes = Effect.gen(function* () {
        const stat = yield* fileSystem.stat(filePath).pipe(Effect.orDie);
        const size = Number(stat.size);
        if (size <= offset) return new Uint8Array(0);
        const chunks = yield* fileSystem
          .stream(filePath, { offset, bytesToRead: size - offset })
          .pipe(Stream.runCollect, Effect.orDie);
        offset = size;
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const bytes = new Uint8Array(totalLength);
        let pos = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, pos);
          pos += chunk.length;
        }
        return bytes;
      });

      const initialRead = Stream.fromEffect(readNewBytes).pipe(
        Stream.filter((bytes) => bytes.length > 0),
      );

      const watchReads = fileSystem.watch(filePath).pipe(
        Stream.filter((event) => event._tag === "Update"),
        Stream.mapEffect(() => readNewBytes),
        Stream.filter((bytes) => bytes.length > 0),
      );

      return Stream.concat(initialRead, watchReads);
    };

    return { stream } as const;
  }),
}) {
  static layer = Layer.effect(this)(this.make).pipe(Layer.provide(NodeServices.layer));
}
