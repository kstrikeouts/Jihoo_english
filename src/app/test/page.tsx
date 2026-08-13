export default function TestSetupPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-stone-700">📝 테스트</h1>
      <form
        action="/test/play"
        method="GET"
        className="flex flex-col gap-5 rounded-2xl border border-orange-100 bg-white p-6 shadow-sm"
      >
        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-stone-600" htmlFor="grade">
            학년을 선택하세요
          </label>
          <select
            id="grade"
            name="grade"
            defaultValue="3"
            className="rounded-xl border border-stone-200 px-3 py-2 text-stone-700"
          >
            <option value="all">전체 학년</option>
            <option value="3">3학년</option>
            <option value="4">4학년</option>
            <option value="5">5학년</option>
            <option value="6">6학년</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-semibold text-stone-600" htmlFor="count">
            문제 수를 선택하세요
          </label>
          <select
            id="count"
            name="count"
            defaultValue="10"
            className="rounded-xl border border-stone-200 px-3 py-2 text-stone-700"
          >
            <option value="10">10문제</option>
            <option value="20">20문제</option>
            <option value="30">30문제</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded-full bg-orange-500 py-3 font-bold text-white shadow hover:bg-orange-600"
        >
          테스트 시작하기
        </button>
      </form>
      <p className="text-center text-xs text-stone-400">
        학습 모드에서 배운 단어들 중에서 문제가 출제돼요.
      </p>
    </div>
  );
}
