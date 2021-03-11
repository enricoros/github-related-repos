const warn = console.warn;

/**
 * constructor(initial_value)
 * subscribe(callback: (value) => any)
 * unsubscribe(callback: (value) => any)
 */
class BaseSubscribable<T> {
  private readonly subscribers: ((value: T) => void)[] = [];
  protected readonly value: T;

  constructor(container: T) {
    if (!container) warn('Subscribable: use NOT NULL initial values!');
    this.value = container;
  }

  addSubscriber(listener: (value: T) => any) {
    if (this.subscribers.includes(listener)) return warn(`Subscribable.addSubscriber: ${listener} already registered`);
    this.subscribers.push(listener);

    // also immediately notify the current value to the subscriber
    listener(this.value);
  }

  removeSubscriber(listener: (value: T) => any) {
    if (!this.subscribers.includes(listener)) return warn(`Subscribable.removeSubscriber: ${listener} not present`);
    this.subscribers.splice(this.subscribers.indexOf(listener), 1);
  }

  protected notifySubscribers = () => this.subscribers.forEach(listener => listener(this.value));
}

/**
 * Subscribe to property changes in objects; typed
 *  - offers partial updates to the object
 */
export class ObjectSubscribable<T extends object> extends BaseSubscribable<T> {
  partialUpdate(update: Partial<T>) {
    Object.assign(this.value, update);
    this.notifySubscribers();
  }

  // returns a shallow copy of the object - not that referenced objects are still modifiable
  // shallowCopy(): T {
  //   return {...this.value};
  // }
}


/**
 * Subscribe to List[T, T, T, ..] changes
 *  - full content updates
 *  - per-item replacement
 */
export class ListSubscribable<T extends object> extends BaseSubscribable<T[]> {
  replaceListContent(newContents: T[]) {
    this.value.length = 0;
    this.value.push(...newContents);
    this.notifySubscribers();
  }

  updateListItem(item: T, findPredicate: (value: T, index: number) => boolean | unknown) {
    const index = this.value.findIndex(findPredicate);
    if (index === -1)
      return console.error(`ListSubscribable.updateItem: cannot find item`, item);
    this.value[index] = item;
    this.notifySubscribers();
  }
}