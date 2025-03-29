import dyad


@dyad.tool(description="gets the weather")
def weather_tool(
    context: dyad.AgentContext,
    output: dyad.Content,
    latitude: float,
    longitude: float,
):
    """
    Gets the weather for a given latitude and longitude
    """
    output.append_chunk(
        dyad.TextChunk(text=f"Fetching weather for {latitude}, {longitude}")
    )
    yield
    temperature = fake_weather_api(latitude, longitude)
    output.append_chunk(
        dyad.TextChunk(text=f"The temperature is {temperature}")
    )
    yield


def fake_weather_api(latitude, longitude):
    return 72.0
