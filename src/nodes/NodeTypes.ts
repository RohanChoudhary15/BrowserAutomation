import { BaseNode } from './BaseNode';
import { ConditionNode } from './ConditionNode';
import { ContainsNode } from './ContainsNode';
import { LoopNode } from './LoopNode';

export const nodeTypes = {
  customNode: BaseNode,
  conditionNode: ConditionNode,
  containsNode: ContainsNode,
  loopNode: LoopNode,
};
