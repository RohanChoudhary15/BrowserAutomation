import { BaseNode } from './BaseNode';
import { ConditionNode } from './ConditionNode';
import { ContainsNode } from './ContainsNode';
import { LoopNode } from './LoopNode';
import { IteratorNode } from './IteratorNode';
import { LogicGateNode } from './LogicGateNode';
import { CombineDatasetsNode } from './CombineDatasetsNode';
import { AsyncParallelNode } from './AsyncParallelNode';
import { SimpleStorageNode } from './SimpleStorageNode';

export const nodeTypes = {
  customNode: BaseNode,
  conditionNode: ConditionNode,
  containsNode: ContainsNode,
  loopNode: LoopNode,
  iteratorNode: IteratorNode,
  logicGateNode: LogicGateNode,
  combineDatasetsNode: CombineDatasetsNode,
  asyncParallelNode: AsyncParallelNode,
  simpleStorageNode: SimpleStorageNode,
};

