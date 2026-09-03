/**
 * Backend mínimo do react-dnd para testes (substitui o `react-dnd-html5-backend`
 * via `vi.mock`). Guarda os handler ids conectados a cada nó e expõe uma
 * simulação de arraste (beginDrag → hover → drop → endDrag) via as actions do
 * dnd-core — mesma ideia do `react-dnd-test-backend`, sem a dependência extra.
 */

type Identifier = string | symbol;

interface DndActions {
   beginDrag(sourceIds: Identifier[], options?: Record<string, unknown>): void;
   hover(targetIds: Identifier[], options?: Record<string, unknown>): void;
   drop(options?: Record<string, unknown>): void;
   endDrag(): void;
}

interface ManagerLike {
   getActions(): DndActions;
}

export class TestBackend {
   private readonly sources = new Map<Element, Identifier>();
   private readonly targets = new Map<Element, Identifier>();

   constructor(private readonly manager: ManagerLike) {}

   setup() {}
   teardown() {}
   profile(): Record<string, number> {
      return { sources: this.sources.size, targets: this.targets.size };
   }

   connectDragSource(sourceId: Identifier, node: Element) {
      this.sources.set(node, sourceId);
      return () => this.sources.delete(node);
   }
   connectDragPreview() {
      return () => {};
   }
   connectDropTarget(targetId: Identifier, node: Element) {
      this.targets.set(node, targetId);
      return () => this.targets.delete(node);
   }

   /** Arrasta `sourceNode` e solta sobre `targetNode` (ambos já conectados). */
   simulateDragDrop(sourceNode: Element, targetNode: Element) {
      const sourceId = this.sources.get(sourceNode);
      const targetId = this.targets.get(targetNode);
      if (sourceId === undefined) throw new Error('source node is not connected to react-dnd');
      if (targetId === undefined) throw new Error('target node is not connected to react-dnd');
      const offset = { x: 0, y: 0 };
      const actions = this.manager.getActions();
      actions.beginDrag([sourceId], {
         clientOffset: offset,
         getSourceClientOffset: () => offset,
      });
      actions.hover([targetId], { clientOffset: offset });
      actions.drop();
      actions.endDrag();
   }
}

/** Última instância criada — o teste a recupera após o `render`. */
export let lastTestBackend: TestBackend | null = null;

export const createTestBackend = (manager: ManagerLike): TestBackend => {
   lastTestBackend = new TestBackend(manager);
   return lastTestBackend;
};
