import { WorkerEntrypoint } from "cloudflare:workers";
import { validateRpc } from "capnweb-validate";
import { listPublicCollectionsFromKv } from "./collection-kv.js";
import { domainName } from "./domain.js";

/** Bounded public collection metadata available to trusted installation services. */
export type PublicContextCollection = {
  id: string;
  title: string;
  description?: string;
  documentCount: number;
};
/** Bounded public document metadata available to trusted installation services. */
export type PublicContextDocument = {
  path: string;
  name: string;
  description?: string;
  contentType: string;
};

/** Narrow read-only entrypoint for public Context collections in one bound sharing domain. */
@validateRpc()
export class PublicContextReader extends WorkerEntrypoint<
  Cloudflare.Env,
  { sharingDomain: string }
> {
  /** Lists bounded metadata for the domain's public collections. */
  async listCollections(): Promise<PublicContextCollection[]> {
    let collections = await listPublicCollectionsFromKv(this.env, this.ctx.props.sharingDomain);
    return collections
      .slice(0, 100)
      .map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        documentCount: item.documentCount,
      }));
  }
  /** Lists bounded document metadata after rechecking public visibility. */
  async listDocuments(collectionId: string): Promise<PublicContextDocument[]> {
    await this.#assertPublic(collectionId);
    let docs = await this.#collection(collectionId).listContextDocuments();
    return docs
      .slice(0, 200)
      .map((item) => ({
        path: item.path,
        name: item.name,
        description: item.description,
        contentType: item.contentType,
      }));
  }
  /** Reads one bounded public document, or null when its path is absent. */
  async readDocument(
    collectionId: string,
    path: string,
  ): Promise<{ path: string; contentType: string; body: string } | null> {
    await this.#assertPublic(collectionId);
    let document = await this.#collection(collectionId).getContextDocument(path);
    if (!document) return null;
    if (new TextEncoder().encode(document.body).byteLength > 200_000)
      throw new Error("Public context document exceeds the architect read limit.");
    return { path: document.path, contentType: document.contentType, body: document.body };
  }
  #collection(collectionId: string) {
    return this.ctx.exports.ContextCollectionDurableObject.getByName(
      domainName(this.ctx.props.sharingDomain, collectionId),
    );
  }
  async #assertPublic(collectionId: string): Promise<void> {
    let collections = await listPublicCollectionsFromKv(this.env, this.ctx.props.sharingDomain);
    if (!collections.some((item) => item.id === collectionId))
      throw new Error("Public Context collection not found.");
  }
}
