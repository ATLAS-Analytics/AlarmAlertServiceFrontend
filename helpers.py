from datetime import UTC, datetime
import os
from pathlib import Path
import pandas as pd
import numpy as np
import urllib3

from elasticsearch import Elasticsearch

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CREDS_PATH = PROJECT_ROOT / 'creds.key'


def _load_credentials():
    user = os.getenv('ES_USER')
    passwd = os.getenv('ES_PASS')
    mapbox_token = os.getenv('MAPBOX_TOKEN') or ''

    if user and passwd:
        return user, passwd, mapbox_token, 'env'

    creds_path = Path(os.getenv('ES_CREDS_FILE', DEFAULT_CREDS_PATH))
    if creds_path.exists():
        with creds_path.open() as f:
            file_user = f.readline().strip()
            file_passwd = f.readline().strip()
            file_mapbox = f.readline().strip()
        return file_user, file_passwd, file_mapbox, 'file'

    raise FileNotFoundError(
        f"Missing Elasticsearch credentials. Set ES_USER/ES_PASS or provide {creds_path}."
    )


class _LazyElasticsearchClient:
    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = connect_es()
        return self._client

    def __getattr__(self, name):
        return getattr(self._get_client(), name)


user = None
passwd = None
creds_source = None


def _env_int(name, default, minimum=0):
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return max(minimum, parsed)


def _env_bool(name, default):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def connect_es():
    global user, passwd, creds_source
    if user is None or passwd is None:
        user, passwd, _, creds_source = _load_credentials()
    credentials = (user, passwd)

    # Explicit ES_HOST always wins.
    es_host_override = os.getenv('ES_HOST')
    if es_host_override:
        es_host = es_host_override
    elif creds_source == 'file':
        # Local creds file implies local tunnel workflow.
        es_host = 'localhost:9200'
    else:
        es_host = 'atlas-kibana.mwt2.org:9200'
    es_url = f'https://{es_host}'
    request_timeout = _env_int('ES_REQUEST_TIMEOUT_SECONDS', 120, minimum=1)
    max_retries = _env_int('ES_MAX_RETRIES', 5, minimum=0)
    retry_on_timeout = _env_bool('ES_RETRY_ON_TIMEOUT', True)

    try:
        es = Elasticsearch(es_url, verify_certs=False,
                           http_auth=credentials, max_retries=max_retries, retry_on_timeout=retry_on_timeout,
                           request_timeout=request_timeout)
        status = 'Success' if es.ping() else 'Fail'
        print(
            f'{status} (Elasticsearch: {es_host}, '
            f'timeout={request_timeout}s, retries={max_retries}, retry_on_timeout={retry_on_timeout})'
        )
        return es
    except Exception as error:
        print(f">>>>>> Elasticsearch Client Error (host={es_host}): {error}")

es = _LazyElasticsearchClient()


def convertTime(ts):
    if pd.notnull(ts):
        return datetime.fromtimestamp(ts / 1000, tz=UTC).strftime('%Y-%m-%d %H:%M')


def normalize_timestamp_column(df, timestamp_col='timestamp', datetime_col='dt', dt_str_col=None, unit='s'):
    """
    Normalize timestamp column to consistent format for Parquet compatibility

    Parameters:
    -----------
    df : pandas.DataFrame
        DataFrame with timestamp data
    timestamp_col : str
        Name of the timestamp column to normalize (default: 'timestamp')
    datetime_col : str
        Name of the datetime column to create (default: 'dt')
    dt_str_col : str | None
        Optional human-readable datetime string column. Default ``None``
        skips creation; pass an explicit name to opt in.
    unit : str
        Unit for timestamp conversion ('s' for seconds, 'ms' for milliseconds)

    Returns:
    --------
    pandas.DataFrame
        DataFrame with normalized timestamp columns
    """
    if df.empty:
        return df
    
    df = df.copy()
    
    # Auto-detect timestamp unit by examining sample data
    detected_unit = unit  # Default to provided unit

    if timestamp_col in df.columns:
        # Sample first non-null timestamp to detect format
        sample_ts = None
        for ts in df[timestamp_col].head(10):
            if pd.notna(ts) and ts is not None:
                sample_ts = ts
                break

        if sample_ts is not None:
            if isinstance(sample_ts, str):
                # ISO string format - will convert to seconds
                detected_unit = 's'
            elif isinstance(sample_ts, (int, float)):
                # Numeric - detect if milliseconds or seconds
                # Milliseconds > 1e12 (after year 2001), seconds < 1e11
                if sample_ts > 1e12:
                    detected_unit = 'ms'
                elif sample_ts < 1e11:
                    detected_unit = 's'
                else:
                    # Ambiguous - use provided unit
                    detected_unit = unit

    # Normalize timestamp column to Int64 for Parquet compatibility
    if timestamp_col in df.columns:
        # Handle various timestamp formats
        def normalize_timestamp_value(ts):
            if pd.isna(ts) or ts is None:
                return pd.NA

            if isinstance(ts, (pd.Timestamp, np.datetime64, datetime)):
                try:
                    return int(pd.Timestamp(ts).timestamp())
                except (ValueError, TypeError, OverflowError):
                    return pd.NA

            if isinstance(ts, str):
                try:
                    # Parse ISO string and convert to seconds (Unix timestamp)
                    dt = pd.to_datetime(ts, utc=True)
                    return int(dt.timestamp())
                except (ValueError, TypeError):
                    # Try to parse as numeric string
                    try:
                        return int(float(ts))
                    except (ValueError, TypeError):
                        return pd.NA

            # Already numeric - keep as-is
            numeric_ts = pd.to_numeric(ts, errors='coerce')
            if pd.isna(numeric_ts):
                return pd.NA
            return int(numeric_ts)

        df[timestamp_col] = df[timestamp_col].apply(normalize_timestamp_value)
        df[timestamp_col] = df[timestamp_col].astype('Int64')

    # Create datetime column from normalized timestamps using detected unit.
    # Build the full series separately so we don't partially assign timezone-aware
    # datetimes into a pre-existing column with an incompatible dtype.
    dt_series = pd.Series(pd.NaT, index=df.index, dtype='datetime64[ns, UTC]')

    valid_mask = df[timestamp_col].notna()
    if valid_mask.any():
        try:
            dt_series.loc[valid_mask] = pd.to_datetime(
                df.loc[valid_mask, timestamp_col].astype('int64'),
                unit=detected_unit,
                utc=True,
            )
        except Exception as e:
            print(f"Warning: Could not convert timestamps to datetime: {e}")
            print(f"Sample timestamp values: {df.loc[valid_mask, timestamp_col].head(3).tolist()}")
            print(f"Timestamp column dtype: {df[timestamp_col].dtype}")

    df[datetime_col] = dt_series

    # Optional human-readable datetime string (caller can opt in by passing
    # an explicit column name). Default skips it to keep the frame compact.
    if dt_str_col:
        df[dt_str_col] = safe_datetime_to_string(df[datetime_col])

    return df


def safe_datetime_to_string(dt_series, format_str='%Y-%m-%d %H:%M:%S UTC'):
    """
    Safely convert datetime series to string, handling NaT values
    
    Parameters:
    -----------
    dt_series : pandas.Series
        Series with datetime values (may contain NaT)
    format_str : str
        Format string for datetime conversion
    
    Returns:
    --------
    pandas.Series
        Series with formatted datetime strings (None for NaT values)
    """
    if dt_series is None or dt_series.empty:
        return pd.Series([None] * len(dt_series), index=dt_series.index) if not dt_series.empty else pd.Series()
    
    result = pd.Series([None] * len(dt_series), index=dt_series.index, dtype='object')
    
    # Check if series has datetime-like values
    try:
        valid_mask = dt_series.notna()
        if valid_mask.any():
            # Ensure we have a proper datetime series
            dt_subset = dt_series.loc[valid_mask]
            if hasattr(dt_subset, 'dt'):
                result.loc[valid_mask] = dt_subset.dt.strftime(format_str)
            else:
                # Try to convert to datetime first
                dt_converted = pd.to_datetime(dt_subset, errors='coerce')
                valid_converted = dt_converted.notna()
                if valid_converted.any():
                    result.loc[valid_mask[valid_converted]] = dt_converted.loc[valid_converted].dt.strftime(format_str)
    except Exception as e:
        print(f"Warning: Could not format datetime strings: {e}")
        # Return series with None values
        pass
    
    return result
