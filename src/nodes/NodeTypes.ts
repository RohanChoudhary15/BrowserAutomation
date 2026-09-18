import { BaseNode } from './BaseNode';
import { ConditionNode } from './ConditionNode';
import { ContainsNode } from './ContainsNode';
import { LoopNode } from './LoopNode';
import { IteratorNode } from './IteratorNode';

export const nodeTypes = {
  customNode: BaseNode,
  conditionNode: ConditionNode,
  containsNode: ContainsNode,
  loopNode: LoopNode,
  iteratorNode: IteratorNode,
};

