// based on https://stackoverflow.com/a/46432113
export class LRU<K, V> {
  max: number
  private cache: Map<K, Promise<V>>
  constructor(max = 1_024) {
    this.max = max
    this.cache = new Map()
  }

  get(key: K) {
    let item = this.cache.get(key)
    if (item !== undefined) {
      // refresh key
      this.cache.delete(key)
      this.cache.set(key, item)
    }
    return item
  }

  set(key: K, val: Promise<V>) {
    // refresh key
    if (this.cache.has(key)) this.cache.delete(key)
    // evict oldest
    else if (this.cache.size >= this.max)
      this.cache.delete(this.nonemptyFirst())
    this.cache.set(key, val)
  }

  delete(key: K) {
    return this.cache.delete(key)
  }

  private nonemptyFirst() {
    return this.cache.keys().next().value!
  }

  async getOrInsertWith(key: K, fn: () => Promise<V>): Promise<V> {
    const val = this.get(key)
    if (val !== undefined) return val

    const promise = fn()
    this.set(key, promise)
    return promise
  }

  // try to insert, but remove from cache on error and bubble
  async getOrTryInsertWith(key: K, fn: () => Promise<V>): Promise<V> {
    const val = this.get(key)
    if (val !== undefined) return val

    const promise = fn()
    this.set(key, promise)
    try {
      return await promise
    } catch (e) {
      this.delete(key)
      throw e
    }
  }
}
