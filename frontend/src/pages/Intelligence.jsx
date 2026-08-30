import React, { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/common/PageHeader";
import Button from "../components/common/Button";
import Loader from "../components/common/Loader";
import Modal from "../components/common/Modal";
import IntelligenceTabs from "../components/intelligence/IntelligenceTabs";
import IntelligenceSummary from "../components/intelligence/IntelligenceSummary";
import Pagination from "../components/intelligence/Pagination";
import ANPRFilters from "../components/intelligence/anpr/ANPRFilters";
import ANPRTable from "../components/intelligence/anpr/ANPRTable";
import ANPRDetails from "../components/intelligence/anpr/ANPRDetails";
import FaceFilters from "../components/intelligence/face/FaceFilters";
import FaceEventTable from "../components/intelligence/face/FaceEventTable";
import FaceEventDetails from "../components/intelligence/face/FaceEventDetails";
import VehicleFilters from "../components/intelligence/vehicle/VehicleFilters";
import VehicleTable from "../components/intelligence/vehicle/VehicleTable";
import VehicleDetails from "../components/intelligence/vehicle/VehicleDetails";
import { RefreshIcon, AlertTriangleIcon } from "../components/common/Icons";
import {
  getANPREvents,
  getFaceEvents,
  getVehicleEvents,
} from "../services/intelligenceApi";
import { getEventById } from "../services/eventApi";

const PAGE_SIZE = 10;

const anprDefaults = {
  search: "",
  camera: "all",
  confidence: "all",
  vehicleType: "all",
  date: "all",
};
const faceDefaults = {
  search: "",
  camera: "all",
  sector: "all",
  confidence: "all",
  date: "all",
};
const vehicleDefaults = {
  search: "",
  vehicleType: "all",
  camera: "all",
  direction: "all",
  risk: "all",
  date: "all",
};

function Intelligence() {
  const [tab, setTab] = useState("anpr");

  const [anpr, setAnpr] = useState([]);
  const [anprFilters, setAnprFilters] = useState(anprDefaults);
  const [anprPage, setAnprPage] = useState(1);
  const [anprTotal, setAnprTotal] = useState(0);
  const [anprLoading, setAnprLoading] = useState(true);
  const [anprError, setAnprError] = useState(false);

  const [faces, setFaces] = useState([]);
  const [faceFilters, setFaceFilters] = useState(faceDefaults);
  const [facePage, setFacePage] = useState(1);
  const [faceTotal, setFaceTotal] = useState(0);
  const [faceLoading, setFaceLoading] = useState(true);
  const [faceError, setFaceError] = useState(false);

  const [vehicles, setVehicles] = useState([]);
  const [vehicleFilters, setVehicleFilters] = useState(vehicleDefaults);
  const [vehiclePage, setVehiclePage] = useState(1);
  const [vehicleTotal, setVehicleTotal] = useState(0);
  const [vehicleLoading, setVehicleLoading] = useState(true);
  const [vehicleError, setVehicleError] = useState(false);

  const [detail, setDetail] = useState(null);

  const loadAnpr = () => {
    setAnprLoading(true);
    setAnprError(false);
    const { search, camera, confidence, vehicleType, date } = anprFilters;
    getANPREvents({
      search: search || undefined,
      camera: camera !== "all" ? camera : undefined,
      confidence: confidence !== "all" ? confidence : undefined,
      vehicleType: vehicleType !== "all" ? vehicleType : undefined,
      date: date !== "all" ? date : undefined,
      page: anprPage,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        setAnpr(res.data || []);
        setAnprTotal(res.meta?.total ?? (res.data || []).length);
      })
      .catch(() => setAnprError(true))
      .finally(() => setAnprLoading(false));
  };

  const loadFace = () => {
    setFaceLoading(true);
    setFaceError(false);
    const { search, camera, sector, confidence, date } = faceFilters;
    getFaceEvents({
      search: search || undefined,
      camera: camera !== "all" ? camera : undefined,
      sector: sector !== "all" ? sector : undefined,
      confidence: confidence !== "all" ? confidence : undefined,
      date: date !== "all" ? date : undefined,
      page: facePage,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        setFaces(res.data || []);
        setFaceTotal(res.meta?.total ?? (res.data || []).length);
      })
      .catch(() => setFaceError(true))
      .finally(() => setFaceLoading(false));
  };

  const loadVehicle = () => {
    setVehicleLoading(true);
    setVehicleError(false);
    const { search, vehicleType, camera, direction, risk, date } = vehicleFilters;
    getVehicleEvents({
      vehicleType: vehicleType !== "all" ? vehicleType : undefined,
      camera: camera !== "all" ? camera : undefined,
      direction: direction !== "all" ? direction : undefined,
      risk: risk !== "all" ? risk : undefined,
      date: date !== "all" ? date : undefined,
      page: vehiclePage,
      pageSize: PAGE_SIZE,
    })
      .then((res) => {
        setVehicles(res.data || []);
        setVehicleTotal(res.meta?.total ?? (res.data || []).length);
      })
      .catch(() => setVehicleError(true))
      .finally(() => setVehicleLoading(false));
  };

  const refreshAll = () => {
    if (tab === "anpr") loadAnpr();
    else if (tab === "face") loadFace();
    else loadVehicle();
  };

  useEffect(loadAnpr, [anprFilters, anprPage]);
  useEffect(loadFace, [faceFilters, facePage]);
  useEffect(loadVehicle, [vehicleFilters, vehiclePage]);

  useEffect(() => {
    setAnprPage(1);
  }, [anprFilters]);
  useEffect(() => {
    setFacePage(1);
  }, [faceFilters]);
  useEffect(() => {
    setVehiclePage(1);
  }, [vehicleFilters]);

  const cameras = useMemo(
    () => [...new Set([...anpr, ...faces, ...vehicles].map((x) => x.cameraId || x.camera).filter(Boolean))].sort(),
    [anpr, faces, vehicles]
  );

  const openDetail = useMemo(
    () => (record) => {
      setDetail({ tab, record });
    },
    [tab]
  );

  return (
    <div>
      <PageHeader
        title="Intelligence"
        subtitle="Review AI-generated vehicle, ANPR, and face detection intelligence from connected CCTV cameras."
      >
        <Button variant="secondary" size="sm" onClick={refreshAll}>
          <RefreshIcon size={15} /> Refresh
        </Button>
      </PageHeader>

      <IntelligenceSummary
        summary={{
          anprToday: anprTotal,
          faceDetections: faceTotal,
          vehicleEvents: vehicleTotal,
          activeCameras: cameras.length,
        }}
      />

      <div className="mt-6">
        <IntelligenceTabs active={tab} onChange={setTab} />

        <div className="pt-4">
          {tab === "anpr" && (
            <div>
              <h2 className="text-base font-semibold text-slate-800">ANPR Events</h2>
              <p className="mb-4 text-sm text-slate-500">
                Detected vehicle number plates from surveillance cameras.
              </p>
              <div className="card mb-4 p-4">
                <ANPRFilters filters={anprFilters} onChange={setAnprFilters} cameras={cameras} />
              </div>
              {renderBody({
                loading: anprLoading,
                error: anprError,
                retry: loadAnpr,
                emptyMsg: "No ANPR events found.",
                records: anpr,
                table: <ANPRTable events={anpr} onView={(e) => openDetail(e)} />,
                pagination: (
                  <Pagination total={anprTotal} page={anprPage} pageSize={PAGE_SIZE} onChange={setAnprPage} />
                ),
              })}
            </div>
          )}

          {tab === "face" && (
            <div>
              <h2 className="text-base font-semibold text-slate-800">Face Detection Events</h2>
              <p className="mb-4 text-sm text-slate-500">
                Detected face regions associated with tracked persons.
              </p>
              <div className="card mb-4 p-4">
                <FaceFilters filters={faceFilters} onChange={setFaceFilters} cameras={cameras} />
              </div>
              {renderBody({
                loading: faceLoading,
                error: faceError,
                retry: loadFace,
                emptyMsg: "No face detection events found.",
                records: faces,
                table: <FaceEventTable events={faces} onView={(e) => openDetail(e)} />,
                pagination: (
                  <Pagination total={faceTotal} page={facePage} pageSize={PAGE_SIZE} onChange={setFacePage} />
                ),
              })}
            </div>
          )}

          {tab === "vehicle" && (
            <div>
              <h2 className="text-base font-semibold text-slate-800">Vehicle Intelligence</h2>
              <p className="mb-4 text-sm text-slate-500">
                Review detected and tracked vehicle activity across surveillance cameras.
              </p>
              <div className="card mb-4 p-4">
                <VehicleFilters filters={vehicleFilters} onChange={setVehicleFilters} cameras={cameras} />
              </div>
              {renderBody({
                loading: vehicleLoading,
                error: vehicleError,
                retry: loadVehicle,
                emptyMsg: "No vehicle events found.",
                records: vehicles,
                table: <VehicleTable events={vehicles} onView={(e) => openDetail(e)} />,
                pagination: (
                  <Pagination total={vehicleTotal} page={vehiclePage} pageSize={PAGE_SIZE} onChange={setVehiclePage} />
                ),
              })}
            </div>
          )}
        </div>
      </div>

      <DetailModal detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function renderBody({ loading, error, retry, emptyMsg, records, table, pagination }) {
  if (loading)
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader label="Loading intelligence data..." />
      </div>
    );
  if (error)
    return (
      <div className="card flex flex-col items-center justify-center gap-3 p-10 text-center">
        <AlertTriangleIcon size={28} className="text-slate-300" />
        <p className="text-sm font-medium text-slate-700">
          Unable to load intelligence data.
        </p>
        <Button variant="secondary" size="sm" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  if (!records.length)
    return (
      <div className="card flex flex-col items-center justify-center gap-2 p-10 text-center">
        <AlertTriangleIcon size={28} className="text-slate-300" />
        <p className="text-sm font-semibold text-slate-700">{emptyMsg}</p>
      </div>
    );
  return (
    <>
      {table}
      {pagination}
    </>
  );
}

function DetailModal({ detail, onClose }) {
  const [eventType, setEventType] = useState(null);

  useEffect(() => {
    setEventType(null);
    if (!detail) return;
    let active = true;
    const eventId = detail.record?.relatedEventId;
    if (eventId) {
      getEventById(eventId)
        .then((res) => active && setEventType(res.data?.type))
        .catch(() => active && setEventType(null));
    }
    return () => {
      active = false;
    };
  }, [detail]);

  if (!detail) return null;

  const title =
    detail.tab === "anpr"
      ? "ANPR Details"
      : detail.tab === "face"
      ? "Face Event Details"
      : "Vehicle Details";

  const content =
    detail.tab === "anpr" ? (
      <ANPRDetails event={detail.record} eventType={eventType} />
    ) : detail.tab === "face" ? (
      <FaceEventDetails event={detail.record} eventType={eventType} />
    ) : (
      <VehicleDetails vehicle={detail.record} eventType={eventType} />
    );

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      {content}
    </Modal>
  );
}

export default Intelligence;
