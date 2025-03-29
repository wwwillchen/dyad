from collections.abc import Callable, Generator, Iterable
from dataclasses import dataclass

from dyad.agent_api.agent_context import (
    AgentContext,
    Tool,
)
from dyad.logging.logging import logger

AgentHandler = Callable[[AgentContext], Generator[None, None, None]]


@dataclass
class Agent:
    handler: AgentHandler
    name: str
    description: str
    tools: Iterable[Tool] | None = None


_agents: dict[str, Agent] = {}


def register_agent(agent: Agent):
    name = agent.name
    if name in _agents:
        logger().info(
            f"Registering agent {name} (overriding the existing agent)"
        )
    _agents[name] = agent


def maybe_get_agent(name: str) -> Agent | None:
    return _agents.get(name)


def get_agent(name: str) -> Agent:
    agent = _agents.get(name)
    if agent is None:
        raise Exception(f"Agent {name} not found")
    return agent


def get_named_agents() -> list[Agent]:
    return sorted(
        [
            _agents[name]
            for name in _agents
            if name != "default" and is_agent_supported(_agents[name])
        ],
        key=lambda x: x.name,
    )


def is_agent_supported(agent: Agent) -> bool:
    if agent.tools is None:
        return True
    return all(
        tool.is_available() if tool.is_available is not None else True
        for tool in agent.tools
    )
