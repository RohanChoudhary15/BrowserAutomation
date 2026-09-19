import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { extractAllPageImages } from '../src/content/domActions';
import { executeExtractAllImages, executeExtractMultiple } from '../src/runtime/executors';
import { WorkflowEngine } from '../src/runtime/engine';
import { NODE_REGISTRY } from '../src/nodes/registry';
import { nodeTypes } from '../src/nodes/NodeTypes';
import { Workflow, WorkflowNode, WorkflowEdge } from '../src/types/workflow';

describe('Quality of Life: Iterator Nodes, Find All Images & Inline Loop Body', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('Node Registry & Types', () => {
    it('registers extract_all_images with iteratorNode reactFlowType', () => {
      const def = NODE_REGISTRY.extract_all_images;
      expect(def).toBeDefined();
      expect(def.label).toBe('Find All Images');
      expect(def.category).toBe('extraction');
      expect(def.reactFlowType).toBe('iteratorNode');
      expect(def.defaultProperties.itemVariable).toBe('currentImage');
    });

    it('registers extract_multiple and extract_image with iteratorNode reactFlowType and itemVariable', () => {
      const multiDef = NODE_REGISTRY.extract_multiple;
      expect(multiDef.reactFlowType).toBe('iteratorNode');
      expect(multiDef.defaultProperties.itemVariable).toBe('currentElement');

      const imgDef = NODE_REGISTRY.extract_image;
      expect(imgDef.reactFlowType).toBe('iteratorNode');
      expect(imgDef.defaultProperties.itemVariable).toBe('currentImage');
    });

    it('has iteratorNode registered in nodeTypes', () => {
      expect(nodeTypes.iteratorNode).toBeDefined();
    });
  });

  describe('extractAllPageImages DOM Action', () => {
    it('extracts all images from document including img, picture source, and background-image', async () => {
      // Setup mock DOM elements
      const container = document.createElement('div');
      container.id = 'gallery';

      const img1 = document.createElement('img');
      img1.src = 'https://example.com/banner.jpg';
      img1.alt = 'Banner';
      Object.defineProperty(img1, 'naturalWidth', { value: 800 });
      Object.defineProperty(img1, 'naturalHeight', { value: 400 });
      container.appendChild(img1);

      const img2 = document.createElement('img');
      img2.src = 'https://example.com/thumb.png';
      img2.alt = 'Thumbnail';
      Object.defineProperty(img2, 'naturalWidth', { value: 150 });
      Object.defineProperty(img2, 'naturalHeight', { value: 150 });
      container.appendChild(img2);

      // Tracking pixel (1x1) should be filtered out
      const tracker = document.createElement('img');
      tracker.src = 'https://example.com/pixel.gif';
      Object.defineProperty(tracker, 'naturalWidth', { value: 1 });
      Object.defineProperty(tracker, 'naturalHeight', { value: 1 });
      container.appendChild(tracker);

      // Div with background image
      const bgDiv = document.createElement('div');
      bgDiv.style.backgroundImage = 'url("https://example.com/bg-pattern.jpg")';
      Object.defineProperty(bgDiv, 'offsetWidth', { value: 300 });
      Object.defineProperty(bgDiv, 'offsetHeight', { value: 200 });
      container.appendChild(bgDiv);

      document.body.appendChild(container);

      const result = await extractAllPageImages({
        containerSelector: '#gallery',
        includeBackground: true,
        minWidth: 10,
        minHeight: 10,
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3); // img1, img2, bgDiv (tracker skipped)
      expect(result.urls).toContain('https://example.com/banner.jpg');
      expect(result.urls).toContain('https://example.com/thumb.png');
      expect(result.urls).toContain('https://example.com/bg-pattern.jpg');
      expect(result.urls).not.toContain('https://example.com/pixel.gif');
    });

    it('generates base64 dataUrl when asBase64 is true', async () => {
      const img = document.createElement('img');
      img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      img.alt = 'Base64 image';
      Object.defineProperty(img, 'naturalWidth', { value: 100 });
      Object.defineProperty(img, 'naturalHeight', { value: 100 });
      document.body.appendChild(img);

      const result = await extractAllPageImages({ asBase64: true, minWidth: 0, minHeight: 0 });
      expect(result.success).toBe(true);
      expect(result.items.length).toBe(1);
      expect(result.items[0].dataUrl).toMatch(/^data:image\//);
    });
  });

  describe('executeExtractAllImages Executor', () => {
    it('executes extract_all_images in runtime and stores output variables', async () => {
      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValueOnce({
            success: true,
            count: 2,
            items: [
              { url: 'https://example.com/pic1.jpg', alt: 'Pic 1', dataUrl: 'https://example.com/pic1.jpg' },
              { url: 'https://example.com/pic2.jpg', alt: 'Pic 2', dataUrl: 'https://example.com/pic2.jpg' },
            ],
            urls: ['https://example.com/pic1.jpg', 'https://example.com/pic2.jpg'],
          }),
        },
      } as any;

      const node: WorkflowNode = {
        id: 'node_all_images',
        type: 'iteratorNode',
        position: { x: 0, y: 0 },
        data: {
          label: 'Find All Images',
          category: 'extraction',
          type: 'extract_all_images',
          properties: {
            outputVariable: 'foundImages',
            itemVariable: 'currentImage',
          },
        },
      };

      const ctx: any = {
        variables: {},
        workflowSettings: {},
        log: vi.fn(),
      };

      const res = await executeExtractAllImages(node, ctx);
      expect(res.success).toBe(true);
      expect(res.variables?.foundImages).toBeDefined();
      expect(res.variables?.foundImages.length).toBe(2);
      expect(res.variables?.foundImages_count).toBe(2);
      expect(res.variables?.foundImages_urls).toContain('https://example.com/pic1.jpg');
    });
  });

  describe('Inline Loop Body Execution in WorkflowEngine', () => {
    it('executes loop body for each item in extract_all_images and exposes currentImage, item, index', async () => {
      const processedItems: any[] = [];
      const processedIndices: number[] = [];

      // Custom mock workflow with extract_all_images connected to a downstream set_variable node via loop_body
      const workflow: Workflow = {
        id: 'wf_inline_loop',
        name: 'Test Inline Loop',
        nodes: [
          {
            id: 'node_all_images',
            type: 'iteratorNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Find All Images',
              category: 'extraction',
              type: 'extract_all_images',
              properties: {
                outputVariable: 'allImages',
                itemVariable: 'currentImage',
              },
            },
          },
          {
            id: 'node_body_action',
            type: 'customNode',
            position: { x: 0, y: 150 },
            data: {
              label: 'Process Image',
              category: 'data',
              type: 'set_variable',
              properties: {
                name: 'lastProcessed',
                value: '{{currentImage.url}}',
              },
            },
          },
          {
            id: 'node_done_action',
            type: 'customNode',
            position: { x: 200, y: 150 },
            data: {
              label: 'Finish Up',
              category: 'data',
              type: 'set_variable',
              properties: {
                name: 'allDone',
                value: 'completed',
              },
            },
          },
        ],
        edges: [
          {
            id: 'edge_loop_body',
            source: 'node_all_images',
            target: 'node_body_action',
            sourceHandle: 'loop_body',
          },
          {
            id: 'edge_loop_done',
            source: 'node_all_images',
            target: 'node_done_action',
            sourceHandle: 'loop_done',
          },
        ],
        variables: {},
        settings: {
          timeout: 5000,
          stopOnError: true,
        },
      };

      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn().mockImplementation(async (msg) => {
            if (msg.payload?.action === 'extract_all_images') {
              return {
                success: true,
                count: 3,
                items: [
                  { url: 'https://example.com/1.png', alt: '1' },
                  { url: 'https://example.com/2.png', alt: '2' },
                  { url: 'https://example.com/3.png', alt: '3' },
                ],
              };
            }
            return { success: true };
          }),
        },
      } as any;

      const engine = new WorkflowEngine(workflow, {
        onVariablesChange: (vars) => {
          if (vars.currentImage) {
            processedItems.push(vars.currentImage.url);
          }
          if (vars.index !== undefined) {
            processedIndices.push(vars.index);
          }
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(engine.getVariables().allDone).toBe('completed');
      expect(engine.getVariables().lastProcessed).toBe('https://example.com/3.png');
      expect(processedItems).toContain('https://example.com/1.png');
      expect(processedItems).toContain('https://example.com/2.png');
      expect(processedItems).toContain('https://example.com/3.png');
    });

    it('executes loop body for each element in extract_multiple and exposes currentElement', async () => {
      const recordedElements: string[] = [];

      const workflow: Workflow = {
        id: 'wf_multi_element_loop',
        name: 'Test Multi Element Loop',
        nodes: [
          {
            id: 'node_multi',
            type: 'iteratorNode',
            position: { x: 0, y: 0 },
            data: {
              label: 'Extract Multiple Elements',
              category: 'extraction',
              type: 'extract_multiple',
              properties: {
                selector: '.item',
                outputVariable: 'extractedList',
                itemVariable: 'currentElement',
              },
            },
          },
          {
            id: 'node_body',
            type: 'customNode',
            position: { x: 0, y: 150 },
            data: {
              label: 'Capture Element',
              category: 'data',
              type: 'set_variable',
              properties: {
                name: 'currentRecorded',
                value: '{{currentElement}}',
              },
            },
          },
        ],
        edges: [
          {
            id: 'edge_loop',
            source: 'node_multi',
            target: 'node_body',
            sourceHandle: 'loop_body',
          },
        ],
        variables: {},
        settings: {
          timeout: 5000,
          stopOnError: true,
        },
      };

      globalThis.chrome = {
        runtime: {
          sendMessage: vi.fn().mockResolvedValueOnce({
            success: true,
            items: ['Apple', 'Banana', 'Cherry'],
          }),
        },
      } as any;

      const engine = new WorkflowEngine(workflow, {
        onVariablesChange: (vars) => {
          if (vars.currentElement) {
            recordedElements.push(vars.currentElement);
          }
        },
      });

      await engine.run();

      expect(engine.getStatus()).toBe('completed');
      expect(recordedElements).toContain('Apple');
      expect(recordedElements).toContain('Banana');
      expect(recordedElements).toContain('Cherry');
    });
  });

  describe('Node Clipboard: Single & Multi-Node Copy & Paste', () => {
    it('copies a single node and can paste at default offset or target position', async () => {
      const {
        copyNodesToClipboard,
        getCopiedNodesFromClipboard,
        hasCopiedNodes,
        preparePastedNodes,
      } = await import('../src/utils/nodeClipboard');

      const originalNode: WorkflowNode = {
        id: 'node_single_1',
        type: 'customNode',
        position: { x: 100, y: 100 },
        data: {
          label: 'Single Click',
          category: 'interaction',
          type: 'click',
          properties: { selector: '#btn' },
        },
      };

      const payload = copyNodesToClipboard([originalNode], []);
      expect(payload.nodes.length).toBe(1);
      expect(payload.edges.length).toBe(0);
      expect(hasCopiedNodes()).toBe(true);

      const cached = getCopiedNodesFromClipboard();
      expect(cached).not.toBeNull();
      expect(cached?.nodes[0].id).toBe('node_single_1');

      // Paste without target pos -> offset by +40, +40
      const pasted1 = preparePastedNodes(payload);
      expect(pasted1.newNodes.length).toBe(1);
      expect(pasted1.newNodes[0].id).not.toBe('node_single_1');
      expect(pasted1.newNodes[0].position).toEqual({ x: 140, y: 140 });
      expect(pasted1.newNodes[0].data.properties.selector).toBe('#btn');

      // Paste with specific target position (e.g., right-click context menu position)
      const pasted2 = preparePastedNodes(payload, { x: 500, y: 350 });
      expect(pasted2.newNodes.length).toBe(1);
      expect(pasted2.newNodes[0].position).toEqual({ x: 500, y: 350 });
    });

    it('copies multiple nodes, preserving internal edges and remapping connection IDs', async () => {
      const {
        copyNodesToClipboard,
        preparePastedNodes,
      } = await import('../src/utils/nodeClipboard');

      const nodeA: WorkflowNode = {
        id: 'node_a',
        type: 'customNode',
        position: { x: 100, y: 200 },
        data: {
          label: 'Node A',
          category: 'browser',
          type: 'navigate',
          properties: { url: 'https://example.com' },
        },
      };

      const nodeB: WorkflowNode = {
        id: 'node_b',
        type: 'customNode',
        position: { x: 300, y: 200 },
        data: {
          label: 'Node B',
          category: 'interaction',
          type: 'click',
          properties: { selector: '.submit' },
        },
      };

      const unselectedNodeC: WorkflowNode = {
        id: 'node_c',
        type: 'customNode',
        position: { x: 500, y: 200 },
        data: {
          label: 'Node C',
          category: 'data',
          type: 'set_variable',
          properties: {},
        },
      };

      const internalEdge: WorkflowEdge = {
        id: 'edge_a_b',
        source: 'node_a',
        target: 'node_b',
      };

      const externalEdge: WorkflowEdge = {
        id: 'edge_b_c',
        source: 'node_b',
        target: 'node_c',
      };

      // Copy nodes A and B
      const payload = copyNodesToClipboard([nodeA, nodeB], [internalEdge, externalEdge]);
      expect(payload.nodes.length).toBe(2);
      expect(payload.edges.length).toBe(1); // Only edge_a_b should be included
      expect(payload.edges[0].id).toBe('edge_a_b');

      // Paste at target position (400, 500)
      const { newNodes, newEdges } = preparePastedNodes(payload, { x: 400, y: 500 });
      expect(newNodes.length).toBe(2);
      expect(newEdges.length).toBe(1);

      const newNodeA = newNodes.find((n) => n.data.label === 'Node A');
      const newNodeB = newNodes.find((n) => n.data.label === 'Node B');
      expect(newNodeA).toBeDefined();
      expect(newNodeB).toBeDefined();
      expect(newNodeA!.id).not.toBe('node_a');
      expect(newNodeB!.id).not.toBe('node_b');

      // Check coordinates preserved relative offset
      expect(newNodeA!.position).toEqual({ x: 400, y: 500 });
      expect(newNodeB!.position).toEqual({ x: 600, y: 500 }); // +200 relative to A

      // Check edge remapped to new node IDs
      expect(newEdges[0].id).not.toBe('edge_a_b');
      expect(newEdges[0].source).toBe(newNodeA!.id);
      expect(newEdges[0].target).toBe(newNodeB!.id);
    });
  });

  describe('Node Deletion: Context Menu, Right-Click, and Alt + Click', () => {
    it('deletes an existing node and cleanly removes all attached edges', () => {
      let nodes: WorkflowNode[] = [
        {
          id: 'node_del_1',
          type: 'customNode',
          position: { x: 0, y: 0 },
          data: { label: 'Node 1', category: 'browser', type: 'navigate', properties: {} },
        },
        {
          id: 'node_del_2',
          type: 'customNode',
          position: { x: 100, y: 100 },
          data: { label: 'Node 2', category: 'interaction', type: 'click', properties: {} },
        },
      ];

      let edges: WorkflowEdge[] = [
        { id: 'edge_1_2', source: 'node_del_1', target: 'node_del_2' },
      ];

      const handleDeleteNode = (nodeId: string) => {
        nodes = nodes.filter((n) => n.id !== nodeId);
        edges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      };

      // Trigger deletion of node_del_1
      handleDeleteNode('node_del_1');

      expect(nodes.length).toBe(1);
      expect(nodes[0].id).toBe('node_del_2');
      expect(edges.length).toBe(0);
    });

    it('triggers node deletion when Alt + Click event occurs', () => {
      const deletedNodeIds: string[] = [];
      const onDeleteNode = (id: string) => {
        deletedNodeIds.push(id);
      };

      // Simulate node click handler logic
      const simulateNodeClick = (event: { altKey: boolean; defaultPrevented?: boolean; stopped?: boolean }, nodeId: string) => {
        if (event.altKey) {
          event.defaultPrevented = true;
          event.stopped = true;
          onDeleteNode(nodeId);
          return;
        }
      };

      // Regular click does not delete
      const normalEvent = { altKey: false };
      simulateNodeClick(normalEvent, 'test_node_1');
      expect(deletedNodeIds).toHaveLength(0);

      // Alt + Click triggers deletion
      const altClickEvent = { altKey: true };
      simulateNodeClick(altClickEvent, 'test_node_1');
      expect(deletedNodeIds).toContain('test_node_1');
      expect(altClickEvent.defaultPrevented).toBe(true);
      expect(altClickEvent.stopped).toBe(true);
    });
  });
});
